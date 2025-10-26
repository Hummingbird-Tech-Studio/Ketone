import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { AuthService } from '../services';
import { AuthApi } from './auth-api';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  PasswordHashErrorSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
} from './schemas';
import { CurrentUser, UnauthorizedErrorSchema } from './middleware';

/**
 * Auth API Handler
 * Implementation of the Auth API contract
 */

export const AuthApiLive = HttpApiBuilder.group(AuthApi, 'auth', (handlers) =>
  Effect.gen(function* () {
    const authService = yield* AuthService;

    return handlers
      .handle('signup', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/signup - Request received`);

          const user = yield* authService.signup(payload.email, payload.password).pipe(
            Effect.catchTags({
              UserAlreadyExistsError: () =>
                Effect.fail(
                  new UserAlreadyExistsErrorSchema({
                    message: 'User with this email already exists',
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
            }),
          );

          yield* Effect.logInfo(`[Handler] User created successfully with id: ${user.id}`);

          return {
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
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
      .handle('updatePassword', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/update-password - Request received`);

          // Access authenticated user from context (provided by Authentication middleware)
          const currentUser = yield* CurrentUser;

          // Validate that authenticated user matches the email in the request
          // This prevents credential stuffing attacks where an attacker uses their token
          // to attempt password changes on other user accounts
          if (currentUser.email.toLowerCase() !== payload.email.toLowerCase()) {
            yield* Effect.logWarning(
              `[Handler] Authentication mismatch: token=${currentUser.email}, payload=${payload.email}`,
            );
            return yield* Effect.fail(
              new UnauthorizedErrorSchema({
                message: 'You can only update your own password',
              }),
            );
          }

          const user = yield* authService
            .updatePassword(payload.email, payload.currentPassword, payload.newPassword)
            .pipe(
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
              }),
            );

          yield* Effect.logInfo(`[Handler] Password updated successfully for user ${user.id}`);

          return {
            message: 'Password updated successfully',
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
          };
        }),
      );
  }),
);
