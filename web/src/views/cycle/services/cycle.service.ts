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
import { CycleResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Cycle Service Error Types
 */
export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class CycleNotFoundError extends S.TaggedError<CycleNotFoundError>()('CycleNotFoundError', {
  message: S.String,
  cycleId: S.String,
}) {}

export class NoCycleInProgressError extends S.TaggedError<NoCycleInProgressError>()('NoCycleInProgressError', {
  message: S.String,
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

export class CycleAlreadyInProgressError extends S.TaggedError<CycleAlreadyInProgressError>()(
  'CycleAlreadyInProgressError',
  {
    message: S.String,
    userId: S.optional(S.String),
  },
) {}

export class CycleOverlapError extends S.TaggedError<CycleOverlapError>()('CycleOverlapError', {
  message: S.String,
  newStartDate: S.optional(S.Date),
  lastCompletedEndDate: S.optional(S.Date),
}) {}

export type { UnauthorizedError };

type ApiErrorResponse = {
  _tag: string;
  message?: string;
  userId?: string;
  newStartDate?: string;
  lastCompletedEndDate?: string;
};

/**
 * Response Types
 */
export type GetCycleSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type GetCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleNotFoundError
  | UnauthorizedError
  | ServerError;

export type GetActiveCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | NoCycleInProgressError
  | UnauthorizedError
  | ServerError;

export type CreateCycleSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type CreateCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleAlreadyInProgressError
  | CycleOverlapError
  | UnauthorizedError
  | ServerError;

/**
 * Handle Get Cycle Response
 */
const handleGetCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<GetCycleSuccess, GetCycleError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(CycleResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new CycleNotFoundError({
              message: errorData.message || 'Cycle not found',
              cycleId,
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new UnauthorizedError({
              message: errorData.message || 'Unauthorized',
            }),
          );
        }),
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
 * Handle Get Active Cycle Response
 */
const handleGetActiveCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<GetCycleSuccess, GetActiveCycleError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(CycleResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new NoCycleInProgressError({
              message: errorData.message || 'No active cycle in progress',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new UnauthorizedError({
              message: errorData.message || 'Unauthorized',
            }),
          );
        }),
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
 * Handle Create Cycle Response
 */
const handleCreateCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<CreateCycleSuccess, CreateCycleError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(CycleResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, CycleAlreadyInProgressError | CycleOverlapError | ServerError> => {
          const errorData = body as ApiErrorResponse;

          if (!errorData._tag) {
            return Effect.fail(
              new ServerError({
                message: errorData.message ?? 'Unexpected conflict response',
              }),
            );
          }

          return Match.value(errorData._tag).pipe(
            Match.when('CycleAlreadyInProgressError', () =>
              Effect.fail(
                new CycleAlreadyInProgressError({
                  message: errorData.message ?? 'User already has a cycle in progress',
                  userId: errorData.userId,
                }),
              ),
            ),
            Match.when('CycleOverlapError', () =>
              Effect.fail(
                new CycleOverlapError({
                  message: errorData.message ?? 'Cycle dates overlap with last completed cycle',
                  newStartDate: errorData.newStartDate ? new Date(errorData.newStartDate) : undefined,
                  lastCompletedEndDate: errorData.lastCompletedEndDate
                    ? new Date(errorData.lastCompletedEndDate)
                    : undefined,
                }),
              ),
            ),
            Match.orElse(() =>
              Effect.fail(
                new ServerError({
                  message: errorData.message ?? `Unhandled error type: ${errorData._tag}`,
                }),
              ),
            ),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new UnauthorizedError({
              message: errorData.message || 'Unauthorized',
            }),
          );
        }),
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
  ) as Effect.Effect<CreateCycleSuccess, CreateCycleError>;

/**
 * Cycle Service
 */
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Get a cycle by ID
       * @param cycleId - The cycle ID
       */
      getCycle: (cycleId: string): Effect.Effect<GetCycleSuccess, GetCycleError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/cycles/${cycleId}`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetCycleResponse(response, cycleId)),
        ),

      /**
       * Get the active cycle in progress for the authenticated user
       */
      getActiveCycle: (): Effect.Effect<GetCycleSuccess, GetActiveCycleError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/cycles/in-progress`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetActiveCycleResponse(response)),
        ),

      /**
       * Create a new cycle
       * @param startDate - The start date of the cycle
       * @param endDate - The end date of the cycle
       */
      createCycle: (startDate: Date, endDate: Date): Effect.Effect<CreateCycleSuccess, CreateCycleError> =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/cycles`).pipe(
          HttpClientRequest.bodyJson({ startDate, endDate }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleCreateCycleResponse(response)),
        ),
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}

/**
 * Live implementation of CycleService
 */
export const CycleServiceLive = CycleService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

/**
 * Program to get a cycle by ID
 */
export const getCycleProgram = (cycleId: string) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.getCycle(cycleId);
  }).pipe(Effect.provide(CycleServiceLive));

/**
 * Program to get the active cycle in progress
 */
export const getActiveCycleProgram = () =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.getActiveCycle();
  }).pipe(Effect.provide(CycleServiceLive));

/**
 * Program to create a new cycle
 */
export const createCycleProgram = (startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.createCycle(startDate, endDate);
  }).pipe(Effect.provide(CycleServiceLive));
