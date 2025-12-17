import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import {
  AuthService,
  PasswordRecoveryService,
  LoginAttemptCache,
  SignupIpRateLimitService,
  PasswordResetIpRateLimitService,
} from '../services';
import { getClientIp } from '../../../utils/http';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  PasswordHashErrorSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
  PasswordResetTokenInvalidErrorSchema,
  LoginRateLimitErrorSchema,
  SignupRateLimitErrorSchema,
  PasswordResetRateLimitErrorSchema,
} from './schemas';

/**
 * Auth API Handler
 * Implementation of the Auth API contract
 */

export const AuthApiLive = HttpApiBuilder.group(Api, 'auth', (handlers) =>
  Effect.gen(function* () {
    const authService = yield* AuthService;
    const passwordRecoveryService = yield* PasswordRecoveryService;
    const loginAttemptCache = yield* LoginAttemptCache;
    const signupIpRateLimitService = yield* SignupIpRateLimitService;
    const passwordResetIpRateLimitService = yield* PasswordResetIpRateLimitService;

    return handlers
      .handle('signup', ({ payload, request }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('POST /auth/signup - Request received');

          // Check IP rate limit
          const ip = yield* getClientIp(request);
          const rateLimitStatus = yield* signupIpRateLimitService.checkAndIncrement(ip);

          if (!rateLimitStatus.allowed) {
            yield* Effect.logWarning('Signup rate limit exceeded for IP');
            return yield* Effect.fail(
              new SignupRateLimitErrorSchema({
                message: 'Too many signup attempts from this location. Please try again later.',
              }),
            );
          }

          const result = yield* authService.signup(payload.email, payload.password).pipe(
            Effect.catchTags({
              UserAlreadyExistsError: (error) =>
                Effect.fail(
                  new UserAlreadyExistsErrorSchema({
                    message: error.message,
                    email: error.email,
                  }),
                ),
              UserRepositoryError: () =>
                Effect.fail(
                  new UserRepositoryErrorSchema({
                    message: 'Database operation failed',
                  }),
                ),
              PasswordHashError: () =>
                Effect.fail(
                  new PasswordHashErrorSchema({
                    message: 'Password processing failed',
                  }),
                ),
              JwtGenerationError: () =>
                Effect.fail(
                  new JwtGenerationErrorSchema({
                    message: 'Token generation failed',
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`User created successfully with id: ${result.user.id}`);

          return {
            token: result.token,
            user: {
              id: result.user.id,
              email: result.user.email,
              createdAt: result.user.createdAt,
              updatedAt: result.user.updatedAt,
            },
          };
        }).pipe(
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
          }),
          Effect.annotateLogs({ handler: 'auth.signup' }),
        ),
      )
      .handle('login', ({ payload, request }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('POST /auth/login - Request received');

          const ip = yield* getClientIp(request);

          // Check rate limit BEFORE password verification (prevents timing attacks)
          // Note: email normalization is handled by LoginAttemptCache
          const attemptStatus = yield* loginAttemptCache.checkAttempt(payload.email, ip);

          if (!attemptStatus.allowed) {
            yield* Effect.logWarning('Login rate limit exceeded for email');
            return yield* Effect.fail(
              new LoginRateLimitErrorSchema({
                message: 'Too many failed login attempts. Please try again later.',
                retryAfter: attemptStatus.retryAfter ?? 0,
              }),
            );
          }

          const result = yield* authService.login(payload.email, payload.password).pipe(
            Effect.tapError((error) =>
              error._tag === 'InvalidCredentialsError'
                ? Effect.gen(function* () {
                    const { delay } = yield* loginAttemptCache.recordFailedAttempt(payload.email, ip);
                    yield* loginAttemptCache.applyDelay(delay);
                  })
                : Effect.void,
            ),
            Effect.tap(() => loginAttemptCache.resetAttempts(payload.email)),
            Effect.catchTags({
              InvalidCredentialsError: () =>
                Effect.fail(
                  new InvalidCredentialsErrorSchema({
                    message: 'Invalid email or password',
                  }),
                ),
              UserRepositoryError: () =>
                Effect.fail(
                  new UserRepositoryErrorSchema({
                    message: 'Database operation failed',
                  }),
                ),
              PasswordHashError: () =>
                Effect.fail(
                  new PasswordHashErrorSchema({
                    message: 'Password processing failed',
                  }),
                ),
              JwtGenerationError: () =>
                Effect.fail(
                  new JwtGenerationErrorSchema({
                    message: 'Token generation failed',
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`User logged in successfully with id: ${result.user.id}`);

          return {
            token: result.token,
            user: {
              id: result.user.id,
              email: result.user.email,
              createdAt: result.user.createdAt,
              updatedAt: result.user.updatedAt,
            },
          };
        }).pipe(
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
          }),
          Effect.annotateLogs({ handler: 'auth.login' }),
        ),
      )
      .handle('forgotPassword', ({ payload, request }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('POST /auth/forgot-password - Request received');

          const ip = yield* getClientIp(request);
          const result = yield* passwordRecoveryService.requestPasswordReset(payload.email, ip);

          yield* Effect.logInfo('Password reset request processed');
          return result;
        }).pipe(
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
            PasswordResetTokenError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Database operation failed',
                }),
              ),
            UserRepositoryError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Database operation failed',
                }),
              ),
          }),
          Effect.annotateLogs({ handler: 'auth.forgotPassword' }),
        ),
      )
      .handle('resetPassword', ({ payload, request }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('POST /auth/reset-password - Request received');

          // Check IP rate limit
          const ip = yield* getClientIp(request);
          const rateLimitStatus = yield* passwordResetIpRateLimitService.checkAndIncrement(ip);

          if (!rateLimitStatus.allowed) {
            yield* Effect.logWarning('Reset password rate limit exceeded for IP');
            return yield* Effect.fail(
              new PasswordResetRateLimitErrorSchema({
                message: 'Too many password reset attempts. Please try again later.',
              }),
            );
          }

          const result = yield* passwordRecoveryService.resetPassword(payload.token, payload.password).pipe(
            Effect.catchTags({
              PasswordResetTokenInvalidError: (error) =>
                Effect.fail(
                  new PasswordResetTokenInvalidErrorSchema({
                    message: error.message,
                  }),
                ),
              PasswordResetTokenError: () =>
                Effect.fail(
                  new PasswordResetTokenInvalidErrorSchema({
                    message: 'Invalid or expired reset token',
                  }),
                ),
              PasswordHashError: () =>
                Effect.fail(
                  new PasswordHashErrorSchema({
                    message: 'Password processing failed',
                  }),
                ),
              UserRepositoryError: () =>
                Effect.fail(
                  new UserRepositoryErrorSchema({
                    message: 'Database operation failed',
                  }),
                ),
            }),
          );

          yield* Effect.logInfo('Password reset completed');
          return result;
        }).pipe(
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
          }),
          Effect.annotateLogs({ handler: 'auth.resetPassword' }),
        ),
      );
  }),
);
