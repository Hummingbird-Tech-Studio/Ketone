import { ServerError, ValidationError } from '@/services/http/errors';
import {
  API_BASE_URL,
  HttpClient,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { VersionResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match } from 'effect';

/**
 * Response Types
 */
export type VersionSuccess = typeof VersionResponseSchema.Type;
export type VersionError = HttpClientError | HttpBodyError | ValidationError | ServerError;

const handleVersionResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<VersionSuccess, VersionError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(VersionResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid version response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.orElse(() =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new ServerError({
              message: errorData.message || `Server error: ${response.status}`,
            }),
          );
        }),
      ),
    ),
  );

/**
 * Version Service
 */
export class VersionService extends Effect.Service<VersionService>()('VersionService', {
  effect: Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;
    const client = defaultClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(API_BASE_URL)));

    return {
      /**
       * Get current app version from server
       */
      getVersion: (): Effect.Effect<VersionSuccess, VersionError> =>
        client.execute(HttpClientRequest.get('/v1/version')).pipe(
          Effect.scoped,
          Effect.flatMap(handleVersionResponse),
        ),
    };
  }),
  accessors: true,
}) {}

/**
 * Live implementation of VersionService
 */
export const VersionServiceLive = VersionService.Default.pipe(Layer.provide(HttpClientLive));

/**
 * Program to get version
 */
export const programGetVersion = Effect.gen(function* () {
  const versionService = yield* VersionService;
  return yield* versionService.getVersion();
}).pipe(Effect.provide(VersionServiceLive));
