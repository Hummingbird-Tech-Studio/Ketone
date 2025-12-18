import {
  handleServerErrorResponse,
  handleUnauthorizedResponse,
  ServerError,
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
  UnauthorizedError,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { CycleStatisticsResponseSchema, type PeriodType } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Response Types
 */
export type GetStatisticsSuccess = S.Schema.Type<typeof CycleStatisticsResponseSchema>;
export type GetStatisticsError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

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
        period: PeriodType,
        date: Date,
      ): Effect.Effect<GetStatisticsSuccess, GetStatisticsError> => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const url = `${API_BASE_URL}/v1/cycles/statistics?period=${period}&date=${date.toISOString()}&tz=${encodeURIComponent(tz)}`;
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
export const getStatisticsProgram = (period: PeriodType, date: Date) =>
  Effect.gen(function* () {
    const statisticsService = yield* StatisticsService;
    return yield* statisticsService.getStatistics(period, date);
  }).pipe(Effect.provide(StatisticsServiceLive));
