import { HttpApiMiddleware, HttpApiSecurity } from '@effect/platform';
import { Context, Effect, Layer, Option, Redacted, Schema as S } from 'effect';
import { JwtService } from '../../services';

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
) {}

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

          yield* Option.match(payload.passwordChangedAt, {
            onNone: () => Effect.void,
            onSome: (passwordChangedAtTimestamp) =>
              payload.iat < passwordChangedAtTimestamp
                ? Effect.gen(function* () {
                    yield* Effect.logWarning(
                      `[Authentication] Token invalidated: issued before password change (iat=${payload.iat}, passwordChangedAt=${passwordChangedAtTimestamp})`,
                    );

                    return yield* Effect.fail(
                      new UnauthorizedErrorSchema({
                        message: 'Token invalidated due to password change',
                      }),
                    );
                  })
                : Effect.void,
          });

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
 * Complete layer with JwtService dependency
 */
export const AuthenticationLive = AuthenticationLiveBase.pipe(Layer.provide(JwtService.Default));
