import { MAX_PASSWORD_ATTEMPTS, UpdatePasswordResponseSchema } from '@ketone/shared';
import { handleServerErrorResponse, ServerError, ValidationError } from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
  HttpClientWith401Interceptor,
  UnauthorizedError,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Account Service Error Types
 */
export class InvalidPasswordError extends S.TaggedError<InvalidPasswordError>()('InvalidPasswordError', {
  message: S.String,
  remainingAttempts: S.Number,
}) {}

export class TooManyRequestsError extends S.TaggedError<TooManyRequestsError>()('TooManyRequestsError', {
  message: S.String,
  remainingAttempts: S.Number,
  retryAfter: S.Number,
}) {}

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
        Effect.flatMap((body): Effect.Effect<never, SameEmailError> => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new SameEmailError({
              message: errorData.message || 'New email is the same as the current email',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, UnauthorizedError> => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new UnauthorizedError({
              message: errorData.message || 'Unauthorized',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.TooManyRequests, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, TooManyRequestsError> => {
          const errorData = body as { message?: string; remainingAttempts?: number; retryAfter?: number };
          return Effect.fail(
            new TooManyRequestsError({
              message: errorData.message || 'Too many requests',
              remainingAttempts: errorData.remainingAttempts ?? 0,
              retryAfter: errorData.retryAfter ?? 900,
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Forbidden, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, InvalidPasswordError> => {
          const errorData = body as { message?: string; remainingAttempts?: number };
          return Effect.fail(
            new InvalidPasswordError({
              message: errorData.message || 'Invalid password',
              remainingAttempts: errorData.remainingAttempts ?? MAX_PASSWORD_ATTEMPTS,
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, EmailAlreadyInUseError> => {
          const errorData = body as { message?: string; email?: string };
          return Effect.fail(
            new EmailAlreadyInUseError({
              message: errorData.message || 'Email already in use',
              email: errorData.email || '',
            }),
          );
        }),
      ),
    ),
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
        Effect.flatMap((body): Effect.Effect<never, SamePasswordError> => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new SamePasswordError({
              message: errorData.message || 'New password must be different from current password',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, UnauthorizedError> => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new UnauthorizedError({
              message: errorData.message || 'Unauthorized',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.TooManyRequests, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, TooManyRequestsError> => {
          const errorData = body as { message?: string; remainingAttempts?: number; retryAfter?: number };
          return Effect.fail(
            new TooManyRequestsError({
              message: errorData.message || 'Too many requests',
              remainingAttempts: errorData.remainingAttempts ?? 0,
              retryAfter: errorData.retryAfter ?? 900,
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Forbidden, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, InvalidPasswordError> => {
          const errorData = body as { message?: string; remainingAttempts?: number };
          return Effect.fail(
            new InvalidPasswordError({
              message: errorData.message || 'Invalid password',
              remainingAttempts: errorData.remainingAttempts ?? MAX_PASSWORD_ATTEMPTS,
            }),
          );
        }),
      ),
    ),
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
export const updateEmailProgram = (email: string, password: string) =>
  Effect.gen(function* () {
    const accountService = yield* AccountService;
    return yield* accountService.updateEmail(email, password);
  }).pipe(Effect.provide(AccountServiceLive));

/**
 * Program to update user password
 */
export const updatePasswordProgram = (currentPassword: string, newPassword: string) =>
  Effect.gen(function* () {
    const accountService = yield* AccountService;
    return yield* accountService.updatePassword(currentPassword, newPassword);
  }).pipe(Effect.provide(AccountServiceLive));
