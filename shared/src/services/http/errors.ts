import type { HttpClientResponse } from '@effect/platform';
import { Effect, Schema as S } from 'effect';

/**
 * Schema for parsing API error responses
 */
const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

const InvalidPasswordResponseSchema = S.Struct({
  message: S.optional(S.String),
  remainingAttempts: S.optional(S.Number),
});

const TooManyRequestsResponseSchema = S.Struct({
  message: S.optional(S.String),
  remainingAttempts: S.optional(S.Number),
  retryAfter: S.optional(S.Number),
});

/**
 * Extracts error message from unknown error types
 */
export const extractErrorMessage = (error: unknown): string =>
  'message' in (error as object) && typeof (error as { message: unknown }).message === 'string'
    ? (error as { message: string }).message
    : String(error);

export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

export class UnauthorizedError extends S.TaggedError<UnauthorizedError>()('UnauthorizedError', {
  message: S.String,
}) {}

export class InvalidPasswordError extends S.TaggedError<InvalidPasswordError>()('InvalidPasswordError', {
  message: S.String,
  remainingAttempts: S.Number,
}) {}

export class TooManyRequestsError extends S.TaggedError<TooManyRequestsError>()('TooManyRequestsError', {
  message: S.String,
  remainingAttempts: S.Number,
  retryAfter: S.Number,
}) {}

/**
 * Generic helper for creating error response handlers
 * Extracts error message from response body and creates the appropriate error
 */
const createErrorResponseHandler = <E>(
  response: HttpClientResponse.HttpClientResponse,
  errorFactory: (message: string) => E,
  defaultMessage: string,
) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(ErrorResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined })),
        Effect.flatMap((errorData) => Effect.fail(errorFactory(errorData.message ?? defaultMessage))),
      ),
    ),
  );

export const handleUnauthorizedResponse = (
  response: HttpClientResponse.HttpClientResponse,
  defaultMessage = 'Unauthorized - invalid or expired token',
) => createErrorResponseHandler(response, (message) => new UnauthorizedError({ message }), defaultMessage);

export const handleValidationErrorResponse = (
  response: HttpClientResponse.HttpClientResponse,
  defaultMessage = 'Validation error',
) => createErrorResponseHandler(response, (message) => new ValidationError({ message }), defaultMessage);

export const handleServerErrorResponse = (response: HttpClientResponse.HttpClientResponse, defaultMessage?: string) =>
  createErrorResponseHandler(
    response,
    (message) => new ServerError({ message }),
    defaultMessage ?? `Server error: ${response.status}`,
  );

export const handleInvalidPasswordResponse = (
  response: HttpClientResponse.HttpClientResponse,
  maxAttempts: number,
  defaultMessage = 'Invalid password',
) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(InvalidPasswordResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined, remainingAttempts: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new InvalidPasswordError({
              message: errorData.message ?? defaultMessage,
              remainingAttempts: errorData.remainingAttempts ?? maxAttempts,
            }),
          ),
        ),
      ),
    ),
  );

export const handleTooManyRequestsResponse = (
  response: HttpClientResponse.HttpClientResponse,
  defaultMessage = 'Too many requests',
  defaultRetryAfter = 900,
) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(TooManyRequestsResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined, remainingAttempts: undefined, retryAfter: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new TooManyRequestsError({
              message: errorData.message ?? defaultMessage,
              remainingAttempts: errorData.remainingAttempts ?? 0,
              retryAfter: errorData.retryAfter ?? defaultRetryAfter,
            }),
          ),
        ),
      ),
    ),
  );
