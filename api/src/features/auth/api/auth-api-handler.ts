import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { AuthService } from '../services';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  PasswordHashErrorSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
} from './schemas';
import { CurrentUser } from './middleware';

/**
 * Auth API Handler
 * Implementation of the Auth API contract
 */

export const AuthApiLive = HttpApiBuilder.group(Api, 'auth', (handlers) =>
  Effect.gen(function* () {
    const authService = yield* AuthService;

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
            },
          };
        }),
      )
      .handle('updatePassword', ({ payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /auth/update-password - Request received`);

          // Access authenticated user from context (provided by Authentication middleware)
          // The userId is immutable and tied to the auth token - use it directly
          const currentUser = yield* CurrentUser;

          const user = yield* authService
            .updatePassword(currentUser.userId, payload.currentPassword, payload.newPassword)
            .pipe(
              Effect.catchTags({
                InvalidCredentialsError: (error) =>
                  Effect.fail(
                    new InvalidCredentialsErrorSchema({
                      message: error.message,
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
            },
          };
        }),
      );
  }),
);
