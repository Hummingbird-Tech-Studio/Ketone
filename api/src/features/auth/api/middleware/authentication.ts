import { HttpApiMiddleware, HttpApiSecurity, HttpServerRequest } from '@effect/platform';
import { Context, Effect, Layer, Option, Redacted, Schema as S } from 'effect';
import { JwtService, UserAuthCache } from '../../services';

/**
 * Authenticated User Context
 * Available in handlers that use the Authentication middleware
 */
export class AuthenticatedUser extends S.Class<AuthenticatedUser>('AuthenticatedUser')({
  userId: S.UUID,
  email: S.String,
}) {}

/**
 * Current User Tag
 * Provides access to authenticated user in protected endpoints
 */
export class CurrentUser extends Context.Tag('CurrentUser')<CurrentUser, AuthenticatedUser>() {}

/**
 * Unauthorized Error Schema
 * Returned when authentication fails
 */
export class UnauthorizedErrorSchema extends S.TaggedError<UnauthorizedErrorSchema>()('UnauthorizedError', {
  message: S.String,
}) {}

/**
 * Authentication Middleware
 * Enforces JWT bearer token authentication on endpoints
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()('Authentication', {
  failure: UnauthorizedErrorSchema,
  provides: CurrentUser,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}

/**
 * Authentication Middleware Implementation
 * Verifies JWT tokens and provides authenticated user context
 *
 * Note: Uses custom layer configuration because HttpApiMiddleware requires
 * Layer.effect pattern for middleware implementation, which is different
 * from Effect.Service pattern used for business logic services.
 */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const jwtService = yield* JwtService;
    const userAuthCache = yield* UserAuthCache;

    yield* Effect.logInfo('Creating Authentication middleware');

    return {
      bearer: (bearerToken) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Verifying bearer token');

          const payload = yield* jwtService.verifyToken(Redacted.value(bearerToken)).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning('Token verification failed', error);
                return yield* Effect.fail(
                  new UnauthorizedErrorSchema({
                    message: 'Invalid or expired token',
                  }),
                );
              }),
            ),
          );

          yield* Effect.logInfo(`Token verified for user ${payload.userId}`);

          const tokenTimestamp = Option.getOrElse(payload.passwordChangedAt, () => payload.iat);
          const isTokenValid = yield* userAuthCache.validateToken(payload.userId, tokenTimestamp).pipe(
            // Fail closed: if cache validation fails, reject the token
            Effect.catchAll((cacheError) =>
              Effect.logWarning(`Cache validation failed, rejecting token: ${cacheError}`).pipe(Effect.as(false)),
            ),
          );

          if (!isTokenValid) {
            yield* Effect.logWarning(`Token invalidated due to password change for user ${payload.userId}`);
            return yield* Effect.fail(
              new UnauthorizedErrorSchema({
                message: 'Token invalidated due to password change',
              }),
            );
          }

          return new AuthenticatedUser({
            userId: payload.userId,
            email: payload.email,
          });
        }).pipe(Effect.annotateLogs({ middleware: 'Authentication' })),
    };
  }),
);

/**
 * Authenticate WebSocket Connection
 * Extracts JWT token from query parameter and validates it
 * Returns authenticated user or fails with UnauthorizedErrorSchema
 *
 * @param request - HttpServerRequest containing the WebSocket upgrade request
 * @returns Effect containing AuthenticatedUser or UnauthorizedErrorSchema
 */
export const authenticateWebSocket = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<AuthenticatedUser, UnauthorizedErrorSchema, JwtService | UserAuthCache> =>
  Effect.gen(function* () {
    const jwtService = yield* JwtService;
    const userAuthCache = yield* UserAuthCache;
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const tokenParam = url.searchParams.get('token');

    if (!tokenParam) {
      yield* Effect.logWarning('No token provided');
      return yield* Effect.fail(
        new UnauthorizedErrorSchema({
          message: 'Authentication token required',
        }),
      );
    }

    const payload = yield* jwtService.verifyToken(tokenParam).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning('Token verification failed', error);
          return yield* Effect.fail(
            new UnauthorizedErrorSchema({
              message: 'Invalid or expired token',
            }),
          );
        }),
      ),
    );

    yield* Effect.logInfo(`Token verified for user ${payload.userId}`);

    const tokenTimestamp = Option.getOrElse(payload.passwordChangedAt, () => payload.iat);
    const isTokenValid = yield* userAuthCache
      .validateToken(payload.userId, tokenTimestamp)
      .pipe(
        // Fail closed: if cache validation fails, reject the token
        Effect.catchAll((cacheError) =>
          Effect.logWarning(`Cache validation failed, rejecting token: ${cacheError}`).pipe(Effect.as(false)),
        ),
      );

    if (!isTokenValid) {
      yield* Effect.logWarning(`Token invalidated due to password change for user ${payload.userId}`);
      return yield* Effect.fail(
        new UnauthorizedErrorSchema({
          message: 'Token invalidated due to password change',
        }),
      );
    }

    return new AuthenticatedUser({
      userId: payload.userId,
      email: payload.email,
    });
  }).pipe(Effect.annotateLogs({ middleware: 'WebSocketAuth' }));
