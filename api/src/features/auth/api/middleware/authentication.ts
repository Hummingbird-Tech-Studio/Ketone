import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from '@effect/platform';
import { Context, Effect, Layer, Redacted, Schema as S } from 'effect';
import { JwtService } from '../../services';
import { UserRepository } from '../../repositories';

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
export class UnauthorizedErrorSchema extends S.TaggedError<UnauthorizedErrorSchema>()(
  'UnauthorizedError',
  {
    message: S.String,
  },
  HttpApiSchema.annotations({ status: 401 }),
) {}

/**
 * Authentication Middleware
 * Enforces JWT bearer token authentication on endpoints
 */
export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  'Authentication',
  {
    failure: UnauthorizedErrorSchema,
    provides: CurrentUser,
    security: {
      bearer: HttpApiSecurity.bearer,
    },
  },
) {}

/**
 * Authentication Middleware Implementation (Base)
 * Verifies JWT tokens and provides authenticated user context
 */
const AuthenticationLiveBase = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const jwtService = yield* JwtService;
    const userRepository = yield* UserRepository;

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

          // Check if token was issued before password change (token invalidation)
          const user = yield* userRepository.findUserByEmailWithPassword(payload.email).pipe(
            Effect.catchAll(() =>
              Effect.gen(function* () {
                yield* Effect.logWarning('[Authentication] User lookup failed during token validation');
                return yield* Effect.fail(
                  new UnauthorizedErrorSchema({
                    message: 'Invalid or expired token',
                  }),
                );
              }),
            ),
          );

          if (!user) {
            yield* Effect.logWarning('[Authentication] User not found during token validation');
            return yield* Effect.fail(
              new UnauthorizedErrorSchema({
                message: 'Invalid or expired token',
              }),
            );
          }

          // If password was changed after token was issued, invalidate the token
          if (user.passwordChangedAt) {
            const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
            if (payload.iat < passwordChangedTimestamp) {
              yield* Effect.logWarning(
                `[Authentication] Token invalidated: issued before password change (iat=${payload.iat}, passwordChangedAt=${passwordChangedTimestamp})`,
              );
              return yield* Effect.fail(
                new UnauthorizedErrorSchema({
                  message: 'Token invalidated due to password change',
                }),
              );
            }
          }

          return new AuthenticatedUser({
            userId: payload.userId,
            email: payload.email,
          });
        }),
    };
  }),
);

/**
 * Authentication Middleware with Dependencies
 * Complete layer with JwtService and UserRepository dependencies
 */
export const AuthenticationLive = AuthenticationLiveBase.pipe(
  Layer.provide(JwtService.Default),
  Layer.provide(UserRepository.Default),
);
