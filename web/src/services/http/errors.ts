import { HttpClientResponse, UnauthorizedError } from '@/services/http/http-client.service';
import { Effect, Schema as S } from 'effect';

export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

export const handleUnauthorizedResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap((body) => {
      const errorData = body as { message?: string };
      return Effect.fail(
        new UnauthorizedError({
          message: errorData.message || 'Unauthorized',
        }),
      );
    }),
  );

export const handleServerErrorResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap((body) => {
      const errorData = body as { message?: string };
      return Effect.fail(
        new ServerError({
          message: errorData.message || `Server error: ${response.status}`,
        }),
      );
    }),
  );
