import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { AuthService } from '../services';
import { AuthApi } from './auth-api';
import {
  PasswordHashErrorSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
} from './schemas';

/**
 * Auth API Handler
 * Implementation of the Auth API contract
 */

export const AuthApiLive = HttpApiBuilder.group(AuthApi, 'auth', (handlers) =>
  Effect.gen(function* () {
    const authService = yield* AuthService;

    return handlers.handle('signup', ({ payload }) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`[Handler] POST /auth/signup - Request received`);
        yield* Effect.logInfo(`[Handler] Email: ${payload.email}`);

        const user = yield* authService.signup(payload.email, payload.password).pipe(
          Effect.catchTags({
            UserAlreadyExistsError: (error) =>
              Effect.fail(
                new UserAlreadyExistsErrorSchema({
                  message: error.message,
                  email: error.email,
                }),
              ),
            UserRepositoryError: (error) =>
              Effect.fail(
                new UserRepositoryErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
            PasswordHashError: (error) =>
              Effect.fail(
                new PasswordHashErrorSchema({
                  message: error.message,
                  cause: error.cause,
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
    );
  }),
);
