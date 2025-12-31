import {
  extractErrorMessage,
  handleInvalidPasswordResponse,
  handleServerErrorResponse,
  handleTooManyRequestsResponse,
  handleUnauthorizedResponse,
  InvalidPasswordError,
  ServerError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
  HttpClientWith401Interceptor,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { MAX_PASSWORD_ATTEMPTS, UpdatePasswordResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Account Service Error Types
 */
export class SameEmailError extends S.TaggedError<SameEmailError>()('SameEmailError', {
  message: S.String,
}) {}

export class EmailAlreadyInUseError extends S.TaggedError<EmailAlreadyInUseError>()('EmailAlreadyInUseError', {
  message: S.String,
  email: S.String,
}) {}

export class SamePasswordError extends S.TaggedError<SamePasswordError>()('SamePasswordError', {
  message: S.String,
}) {}

/**
 * Error Response Schemas for safe JSON parsing
 */
const MessageErrorSchema = S.Struct({
  message: S.optional(S.String),
});

const EmailAlreadyInUseResponseSchema = S.Struct({
  message: S.optional(S.String),
  email: S.optional(S.String),
});

/**
 * Response Schema (defined locally since it doesn't exist in @ketone/shared)
 */
const UpdateEmailResponseSchema = S.Struct({
  id: S.String,
  email: S.String,
});

/**
 * Response Types
 */
export type UpdateEmailSuccess = S.Schema.Type<typeof UpdateEmailResponseSchema>;
export type UpdateEmailError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | InvalidPasswordError
  | TooManyRequestsError
  | SameEmailError
  | EmailAlreadyInUseError
  | UnauthorizedError
  | ServerError;

/**
 * Update Password Response Types
 */
export type UpdatePasswordSuccess = S.Schema.Type<typeof UpdatePasswordResponseSchema>;
export type UpdatePasswordError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | InvalidPasswordError
  | TooManyRequestsError
  | SamePasswordError
  | UnauthorizedError
  | ServerError;

/**
 * Delete Account Response Types
 */
export type DeleteAccountError =
  | HttpClientError
  | HttpBodyError
  | InvalidPasswordError
  | TooManyRequestsError
  | UnauthorizedError
  | ServerError;

/**
 * Handle Update Email Response
 */
const handleUpdateEmailResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<UpdateEmailSuccess, UpdateEmailError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(UpdateEmailResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(MessageErrorSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new SameEmailError({
                  message: errorData.message ?? 'New email is the same as the current email',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.when(HttpStatus.Forbidden, () => handleInvalidPasswordResponse(response, MAX_PASSWORD_ATTEMPTS)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(EmailAlreadyInUseResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined, email: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new EmailAlreadyInUseError({
                  message: errorData.message ?? 'Email already in use',
                  email: errorData.email ?? '',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.TooManyRequests, () => handleTooManyRequestsResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Update Password Response
 */
const handleUpdatePasswordResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<UpdatePasswordSuccess, UpdatePasswordError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(UpdatePasswordResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(MessageErrorSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new SamePasswordError({
                  message: errorData.message ?? 'New password must be different from current password',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.when(HttpStatus.Forbidden, () => handleInvalidPasswordResponse(response, MAX_PASSWORD_ATTEMPTS)),
    Match.when(HttpStatus.TooManyRequests, () => handleTooManyRequestsResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Delete Account Response
 */
const handleDeleteAccountResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<void, DeleteAccountError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.NoContent, () => Effect.void),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.when(HttpStatus.Forbidden, () => handleInvalidPasswordResponse(response, MAX_PASSWORD_ATTEMPTS)),
    Match.when(HttpStatus.TooManyRequests, () => handleTooManyRequestsResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Account Service
 */
export class AccountService extends Effect.Service<AccountService>()('AccountService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Update user email
       * @param email - New email address
       * @param password - Current password for verification
       */
      updateEmail: (email: string, password: string): Effect.Effect<UpdateEmailSuccess, UpdateEmailError> =>
        HttpClientRequest.put(`${API_BASE_URL}/v1/account/email`).pipe(
          HttpClientRequest.bodyJson({ email, password }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleUpdateEmailResponse),
        ),

      /**
       * Update user password
       * @param currentPassword - Current password for verification
       * @param newPassword - New password
       */
      updatePassword: (
        currentPassword: string,
        newPassword: string,
      ): Effect.Effect<UpdatePasswordSuccess, UpdatePasswordError> =>
        HttpClientRequest.put(`${API_BASE_URL}/v1/account/password`).pipe(
          HttpClientRequest.bodyJson({ currentPassword, newPassword }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleUpdatePasswordResponse),
        ),

      /**
       * Delete user account
       * @param password - Current password for verification
       */
      deleteAccount: (password: string): Effect.Effect<void, DeleteAccountError> =>
        HttpClientRequest.del(`${API_BASE_URL}/v1/account`).pipe(
          HttpClientRequest.bodyJson({ password }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleDeleteAccountResponse),
        ),
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}

/**
 * Live implementation of AccountService
 */
export const AccountServiceLive = AccountService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

/**
 * Program to update user email
 */
export const programUpdateEmail = (email: string, password: string) =>
  AccountService.updateEmail(email, password).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update email', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'AccountService' }),
    Effect.provide(AccountServiceLive),
  );

/**
 * Program to update user password
 */
export const programUpdatePassword = (currentPassword: string, newPassword: string) =>
  AccountService.updatePassword(currentPassword, newPassword).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update password', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'AccountService' }),
    Effect.provide(AccountServiceLive),
  );

/**
 * Program to delete user account
 */
export const programDeleteAccount = (password: string) =>
  AccountService.deleteAccount(password).pipe(
    Effect.tapError((error) => Effect.logError('Failed to delete account', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'AccountService' }),
    Effect.provide(AccountServiceLive),
  );
