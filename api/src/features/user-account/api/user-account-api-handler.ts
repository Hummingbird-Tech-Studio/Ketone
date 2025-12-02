import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { UserAccountService } from '../services';
import {
  InvalidPasswordErrorSchema,
  SameEmailErrorSchema,
  EmailAlreadyInUseErrorSchema,
  UserAccountServiceErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

export const UserAccountApiLive = HttpApiBuilder.group(Api, 'user-account', (handlers) =>
  Effect.gen(function* () {
    const userAccountService = yield* UserAccountService;

    return handlers.handle('updateEmail', ({ payload }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;

        yield* Effect.logInfo(`[Handler] PUT /api/v1/account/email - Request received for user ${userId}`);

        const result = yield* userAccountService.updateEmail(userId, payload.email, payload.password).pipe(
          Effect.tapError((error) => Effect.logError(`[Handler] Error updating email: ${error._tag}`)),
          Effect.catchTags({
            InvalidPasswordError: (error) =>
              Effect.fail(
                new InvalidPasswordErrorSchema({
                  message: error.message,
                }),
              ),
            SameEmailError: (error) =>
              Effect.fail(
                new SameEmailErrorSchema({
                  message: error.message,
                }),
              ),
            EmailAlreadyInUseError: (error) =>
              Effect.fail(
                new EmailAlreadyInUseErrorSchema({
                  message: error.message,
                  email: error.email,
                }),
              ),
            UserAccountServiceError: (error) =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
            UserRepositoryError: (error) =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
            PasswordHashError: (error) =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
          }),
        );

        yield* Effect.logInfo(`[Handler] Email updated successfully for user ${userId}`);
        return result;
      }),
    );
  }),
);
