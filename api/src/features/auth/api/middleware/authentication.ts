import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform';
import { Context, Effect, Layer, Option, Redacted, Schema as S } from 'effect';
import { JwtService, UserAuthCache, UserAuthCacheLive } from '../../services';

/**
 * Authenticated User Context
 * Available in handlers that use the Authentication middleware
 */
export class AuthenticatedUser extends S.Class<AuthenticatedUser>('AuthenticatedUser')({
  userId: S.String,
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
 * Authentication Middleware Implementation (Base)
 * Verifies JWT tokens and provides authenticated user context
 */
const AuthenticationLiveBase = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const jwtService = yield* JwtService;
    const userAuthCache = yield* UserAuthCache;

    yield* Effect.logInfo('[AuthenticationLive] Creating Authentication middleware');

    return {
      bearer: (bearerToken) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('[Authentication] Verifying bearer token');

          const payload = yield* jwtService.verifyToken(Redacted.value(bearerToken)).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logWarning('[Authentication] Token verification failed', error);
                return yield* Effect.fail(
                  new UnauthorizedErrorSchema({
                    message: 'Invalid or expired token',
                  }),
                );
              }),
            ),
          );

          yield* Effect.logInfo(`[Authentication] Token verified for user ${payload.userId}`);

          // Check if token is still valid (not invalidated by password change)
          // Use passwordChangedAt from token if available, otherwise fall back to iat
          const tokenTimestamp = Option.getOrElse(payload.passwordChangedAt, () => payload.iat);

          const isTokenValid = yield* userAuthCache.validateToken(payload.userId, tokenTimestamp).pipe(
            Effect.catchAll((error) =>
              // If cache is unavailable, log warning but allow the request
              // This prevents cache/DB issues from blocking all authenticated requests
              Effect.logWarning(`[Authentication] Failed to validate token via cache, allowing request: ${error}`).pipe(
                Effect.as(true),
              ),
            ),
          );

          if (!isTokenValid) {
            yield* Effect.logWarning(
              `[Authentication] Token invalidated due to password change for user ${payload.userId}`,
            );
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
        }),
    };
  }),
);

export const AuthenticationLive = AuthenticationLiveBase.pipe(
  Layer.provide(JwtService.Default),
  Layer.provide(UserAuthCacheLive),
);
