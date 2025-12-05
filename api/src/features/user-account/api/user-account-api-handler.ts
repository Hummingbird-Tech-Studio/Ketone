import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { UserAccountService } from '../services';
import {
  InvalidPasswordErrorSchema,
  TooManyRequestsErrorSchema,
  SameEmailErrorSchema,
  EmailAlreadyInUseErrorSchema,
  UserAccountServiceErrorSchema,
  UpdatePasswordResponseSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';
import { getClientIp } from '../../../utils/http';

export const UserAccountApiLive = HttpApiBuilder.group(Api, 'user-account', (handlers) =>
  Effect.gen(function* () {
    const userAccountService = yield* UserAccountService;

    return handlers.handle('updateEmail', ({ payload, request }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;
        const ip = yield* getClientIp(request);

        yield* Effect.logInfo(`[Handler] PUT /api/v1/account/email - Request received for user ${userId}`);

        const result = yield* userAccountService.updateEmail(userId, payload.email, payload.password, ip);

        yield* Effect.logInfo(`[Handler] Email updated successfully for user ${userId}`);
        return result;
      }).pipe(
        Effect.tapError((error) => Effect.logError(`[Handler] Error updating email: ${error._tag}`)),
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
      ),
    ).handle('updatePassword', ({ payload, request }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;
        const ip = yield* getClientIp(request);

        yield* Effect.logInfo(`[Handler] PUT /api/v1/account/password - Request received for user ${userId}`);

        const result = yield* userAccountService.updatePassword(
          userId,
          payload.currentPassword,
          payload.newPassword,
          ip,
        );

        yield* Effect.logInfo(`[Handler] Password updated successfully for user ${userId}`);
        return new UpdatePasswordResponseSchema({ message: result.message });
      }).pipe(
        Effect.tapError((error) => Effect.logError(`[Handler] Error updating password: ${error._tag}`)),
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
        }),
      ),
    ).handle('deleteAccount', ({ payload, request }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;
        const ip = yield* getClientIp(request);

        yield* Effect.logInfo(`[Handler] DELETE /api/v1/account - Request received for user ${userId}`);

        yield* userAccountService.deleteAccount(userId, payload.password, ip);

        yield* Effect.logInfo(`[Handler] Account deleted successfully for user ${userId}`);
      }).pipe(
        Effect.tapError((error) => Effect.logError(`[Handler] Error deleting account: ${error._tag}`)),
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
      ),
    );
  }),
);
