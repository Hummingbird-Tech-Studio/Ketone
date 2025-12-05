import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { AuthService, PasswordRecoveryService } from '../services';
import { getClientIp } from '../../../utils/http';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  PasswordHashErrorSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
  PasswordResetTokenInvalidErrorSchema,
} from './schemas';

/**
 * Auth API Handler
 * Implementation of the Auth API contract
 */

export const AuthApiLive = HttpApiBuilder.group(Api, 'auth', (handlers) =>
  Effect.gen(function* () {
    const authService = yield* AuthService;
    const passwordRecoveryService = yield* PasswordRecoveryService;

    return handlers
      .handle('signup', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/signup - Request received`);

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

          yield* Effect.logInfo(`[Handler] User created successfully with id: ${result.user.id}`);

          return {
            token: result.token,
            user: {
              id: result.user.id,
              email: result.user.email,
              createdAt: result.user.createdAt,
              updatedAt: result.user.updatedAt,
            },
          };
        }),
      )
      .handle('login', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/login - Request received`);

          const result = yield* authService.login(payload.email, payload.password).pipe(
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

          yield* Effect.logInfo(`[Handler] User logged in successfully with id: ${result.user.id}`);

          return {
            token: result.token,
            user: {
              id: result.user.id,
              email: result.user.email,
              createdAt: result.user.createdAt,
              updatedAt: result.user.updatedAt,
            },
          };
        }),
      )
      .handle('forgotPassword', ({ payload, request }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/forgot-password - Request received`);

          const ip = yield* getClientIp(request);
          const result = yield* passwordRecoveryService.requestPasswordReset(payload.email, ip);

          yield* Effect.logInfo(`[Handler] Password reset request processed`);
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
        ),
      )
      .handle('resetPassword', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/reset-password - Request received`);

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

          yield* Effect.logInfo(`[Handler] Password reset completed`);
          return result;
        }),
      );
  }),
);
