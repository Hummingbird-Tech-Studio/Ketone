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
      );
  }),
);
