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
import { CycleStatisticsResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Statistics Service Error Types
 */
export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

export type { UnauthorizedError };

/**
 * Response Types
 */
export type GetStatisticsSuccess = S.Schema.Type<typeof CycleStatisticsResponseSchema>;
export type GetStatisticsError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

/**
 * Shared Error Response Handlers
 */
const handleUnauthorizedResponse = (response: HttpClientResponse.HttpClientResponse) =>
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

const handleServerErrorResponse = (response: HttpClientResponse.HttpClientResponse) =>
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

/**
 * Handle Get Statistics Response
 */
const handleGetStatisticsResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<GetStatisticsSuccess, GetStatisticsError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(CycleStatisticsResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Statistics Service
 */
export class StatisticsService extends Effect.Service<StatisticsService>()('StatisticsService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Get cycle statistics for a given period
       * @param period - The period type ('weekly' or 'monthly')
       * @param date - The reference date for the period
       */
      getStatistics: (
        period: 'weekly' | 'monthly',
        date: Date,
      ): Effect.Effect<GetStatisticsSuccess, GetStatisticsError> => {
        const url = `${API_BASE_URL}/v1/cycles/statistics?period=${period}&date=${date.toISOString()}`;
        return authenticatedClient.execute(HttpClientRequest.get(url)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetStatisticsResponse(response)),
        );
      },
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}

/**
 * Live implementation of StatisticsService
 */
export const StatisticsServiceLive = StatisticsService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

/**
 * Program to get cycle statistics
 */
export const getStatisticsProgram = (period: 'weekly' | 'monthly', date: Date) =>
  Effect.gen(function* () {
    const statisticsService = yield* StatisticsService;
    return yield* statisticsService.getStatistics(period, date);
  }).pipe(Effect.provide(StatisticsServiceLive));
