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
}) {}

export class SameEmailError extends S.TaggedError<SameEmailError>()('SameEmailError', {
  message: S.String,
}) {}

export class EmailAlreadyInUseError extends S.TaggedError<EmailAlreadyInUseError>()('EmailAlreadyInUseError', {
  message: S.String,
  email: S.String,
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
  | SameEmailError
  | EmailAlreadyInUseError
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
    Match.when(HttpStatus.Forbidden, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, InvalidPasswordError> => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new InvalidPasswordError({
              message: errorData.message || 'Invalid password',
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
