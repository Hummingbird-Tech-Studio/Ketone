import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { UserAccountService } from '../services';
import {
  InvalidPasswordErrorSchema,
  TooManyRequestsErrorSchema,
  SameEmailErrorSchema,
  SamePasswordErrorSchema,
  EmailAlreadyInUseErrorSchema,
  UserAccountServiceErrorSchema,
  UpdatePasswordResponseSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';
import { getClientIp } from '../../../utils/http';

export const UserAccountApiLive = HttpApiBuilder.group(Api, 'user-account', (handlers) =>
  Effect.gen(function* () {
    const userAccountService = yield* UserAccountService;

    return handlers
      .handle('updateEmail', ({ payload, request }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const ip = yield* getClientIp(request);

          yield* Effect.logInfo(`PUT /api/v1/account/email - Request received for user ${userId}`);

          const result = yield* userAccountService.updateEmail(userId, payload.email, payload.password, ip);

          yield* Effect.logInfo(`Email updated successfully for user ${userId}`);
          return result;
        }).pipe(
          Effect.tapError((error) => Effect.logError(`Error updating email: ${error._tag}`)),
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
            TooManyRequestsError: (error) =>
              Effect.fail(
                new TooManyRequestsErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
                  retryAfter: error.retryAfter,
                }),
              ),
            InvalidPasswordError: (error) =>
              Effect.fail(
                new InvalidPasswordErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
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
          Effect.annotateLogs({ handler: 'account.updateEmail' }),
        ),
      )
      .handle('updatePassword', ({ payload, request }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const ip = yield* getClientIp(request);

          yield* Effect.logInfo(`PUT /api/v1/account/password - Request received for user ${userId}`);

          const result = yield* userAccountService.updatePassword(
            userId,
            payload.currentPassword,
            payload.newPassword,
            ip,
          );

          yield* Effect.logInfo(`Password updated successfully for user ${userId}`);
          return new UpdatePasswordResponseSchema({ message: result.message });
        }).pipe(
          Effect.tapError((error) => Effect.logError(`Error updating password: ${error._tag}`)),
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
            TooManyRequestsError: (error) =>
              Effect.fail(
                new TooManyRequestsErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
                  retryAfter: error.retryAfter,
                }),
              ),
            InvalidPasswordError: (error) =>
              Effect.fail(
                new InvalidPasswordErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
                }),
              ),
            SamePasswordError: (error) =>
              Effect.fail(
                new SamePasswordErrorSchema({
                  message: error.message,
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
          Effect.annotateLogs({ handler: 'account.updatePassword' }),
        ),
      )
      .handle('deleteAccount', ({ payload, request }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const ip = yield* getClientIp(request);

          yield* Effect.logInfo(`DELETE /api/v1/account - Request received for user ${userId}`);

          yield* userAccountService.deleteAccount(userId, payload.password, ip);

          yield* Effect.logInfo(`Account deleted successfully for user ${userId}`);
        }).pipe(
          Effect.tapError((error) => Effect.logError(`Error deleting account: ${error._tag}`)),
          Effect.catchTags({
            ClientIpNotFoundError: () =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: 'Server configuration error',
                }),
              ),
            TooManyRequestsError: (error) =>
              Effect.fail(
                new TooManyRequestsErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
                  retryAfter: error.retryAfter,
                }),
              ),
            InvalidPasswordError: (error) =>
              Effect.fail(
                new InvalidPasswordErrorSchema({
                  message: error.message,
                  remainingAttempts: error.remainingAttempts,
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
            CycleRepositoryError: (error) =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
            ProfileRepositoryError: (error) =>
              Effect.fail(
                new UserAccountServiceErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
          }),
          Effect.annotateLogs({ handler: 'account.deleteAccount' }),
        ),
      );
  }),
);
