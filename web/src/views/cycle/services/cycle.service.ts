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
import { CycleResponseSchema, CycleDetailResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Cycle Service Error Types
 */
export class CycleNotFoundError extends S.TaggedError<CycleNotFoundError>()('CycleNotFoundError', {
  message: S.String,
  cycleId: S.String,
}) {}

export class NoCycleInProgressError extends S.TaggedError<NoCycleInProgressError>()('NoCycleInProgressError', {
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

export class CycleIdMismatchError extends S.TaggedError<CycleIdMismatchError>()('CycleIdMismatchError', {
  message: S.String,
  requestedCycleId: S.String,
  activeCycleId: S.String,
}) {}

export class CycleInvalidStateError extends S.TaggedError<CycleInvalidStateError>()('CycleInvalidStateError', {
  message: S.String,
  currentState: S.String,
  expectedState: S.String,
}) {}

type ApiErrorResponse = {
  _tag: string;
  message?: string;
  userId?: string;
  newStartDate?: string;
  lastCompletedEndDate?: string;
  requestedCycleId?: string;
  activeCycleId?: string;
  currentState?: string;
  expectedState?: string;
};

/**
 * Cycle-specific Error Response Handlers
 */
const handleNotFoundWithCycleIdResponse = (response: HttpClientResponse.HttpClientResponse, cycleId: string) =>
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
  );

/**
 * Response Types
 */
export type GetCycleSuccess = S.Schema.Type<typeof CycleDetailResponseSchema>;
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

export type UpdateCycleSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type UpdateCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleNotFoundError
  | CycleIdMismatchError
  | CycleInvalidStateError
  | CycleOverlapError
  | UnauthorizedError
  | ServerError;

export type CompleteCycleSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type CompleteCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleNotFoundError
  | CycleIdMismatchError
  | CycleInvalidStateError
  | CycleOverlapError
  | UnauthorizedError
  | ServerError;

export type DeleteCycleError =
  | HttpClientError
  | HttpBodyError
  | CycleNotFoundError
  | CycleInvalidStateError
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
      HttpClientResponse.schemaBodyJson(CycleDetailResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithCycleIdResponse(response, cycleId)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
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
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
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
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Shared response handler for Update and Complete Cycle operations
 */
const handleCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<UpdateCycleSuccess, UpdateCycleError> =>
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
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithCycleIdResponse(response, cycleId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap(
          (
            body,
          ): Effect.Effect<never, CycleIdMismatchError | CycleInvalidStateError | CycleOverlapError | ServerError> => {
            const errorData = body as ApiErrorResponse;

            if (!errorData._tag) {
              return Effect.fail(
                new ServerError({
                  message: errorData.message ?? 'Unexpected conflict response',
                }),
              );
            }

            return Match.value(errorData._tag).pipe(
              Match.when('CycleIdMismatchError', () =>
                Effect.fail(
                  new CycleIdMismatchError({
                    message: errorData.message ?? 'Cycle ID mismatch',
                    requestedCycleId: errorData.requestedCycleId ?? '',
                    activeCycleId: errorData.activeCycleId ?? '',
                  }),
                ),
              ),
              Match.when('CycleInvalidStateError', () =>
                Effect.fail(
                  new CycleInvalidStateError({
                    message: errorData.message ?? 'Cycle is in an invalid state for this operation',
                    currentState: errorData.currentState ?? '',
                    expectedState: errorData.expectedState ?? '',
                  }),
                ),
              ),
              Match.when('CycleOverlapError', () =>
                Effect.fail(
                  new CycleOverlapError({
                    message: errorData.message ?? 'Cycle dates overlap with another cycle',
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
          },
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Update Cycle Response
 */
const handleUpdateCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<UpdateCycleSuccess, UpdateCycleError> => handleCycleResponse(response, cycleId);

/**
 * Handle Complete Cycle Response
 */
const handleCompleteCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<CompleteCycleSuccess, CompleteCycleError> => handleCycleResponse(response, cycleId);

/**
 * Handle Delete Cycle Response
 */
const handleDeleteCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<void, DeleteCycleError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.NoContent, () => Effect.void),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithCycleIdResponse(response, cycleId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as ApiErrorResponse;
          return Effect.fail(
            new CycleInvalidStateError({
              message: errorData.message ?? 'Cannot delete a cycle that is not completed',
              currentState: errorData.currentState ?? '',
              expectedState: errorData.expectedState ?? 'Completed',
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

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

      /**
       * Update an existing cycle's dates
       * @param cycleId - The cycle ID to update
       * @param startDate - The new start date of the cycle
       * @param endDate - The new end date of the cycle
       */
      updateCycle: (
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<UpdateCycleSuccess, UpdateCycleError> =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/cycles/${cycleId}`).pipe(
          HttpClientRequest.bodyJson({ startDate, endDate }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdateCycleResponse(response, cycleId)),
        ),

      /**
       * Update an existing completed cycle's dates
       * @param cycleId - The cycle ID to update
       * @param startDate - The new start date
       * @param endDate - The new end date
       */
      updateCompletedCycle: (
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<UpdateCycleSuccess, UpdateCycleError> =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/cycles/${cycleId}/completed`).pipe(
          HttpClientRequest.bodyJson({ startDate, endDate }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdateCycleResponse(response, cycleId)),
        ),

      /**
       * Complete an existing cycle
       * @param cycleId - The cycle ID to complete
       * @param startDate - The start date of the cycle
       * @param endDate - The end date of the cycle
       */
      completeCycle: (
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<CompleteCycleSuccess, CompleteCycleError> =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/cycles/${cycleId}/complete`).pipe(
          HttpClientRequest.bodyJson({ startDate, endDate }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleCompleteCycleResponse(response, cycleId)),
        ),

      /**
       * Delete a completed cycle
       * @param cycleId - The cycle ID to delete
       */
      deleteCycle: (cycleId: string): Effect.Effect<void, DeleteCycleError> =>
        authenticatedClient.execute(HttpClientRequest.del(`${API_BASE_URL}/v1/cycles/${cycleId}`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleDeleteCycleResponse(response, cycleId)),
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

/**
 * Program to update an existing cycle's dates
 */
export const updateCycleProgram = (cycleId: string, startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.updateCycle(cycleId, startDate, endDate);
  }).pipe(Effect.provide(CycleServiceLive));

/**
 * Program to update an existing completed cycle's dates
 */
export const updateCompletedCycleProgram = (cycleId: string, startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.updateCompletedCycle(cycleId, startDate, endDate);
  }).pipe(Effect.provide(CycleServiceLive));

/**
 * Program to complete an existing cycle
 */
export const completeCycleProgram = (cycleId: string, startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.completeCycle(cycleId, startDate, endDate);
  }).pipe(Effect.provide(CycleServiceLive));

/**
 * Program to delete a completed cycle
 */
export const deleteCycleProgram = (cycleId: string) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;
    return yield* cycleService.deleteCycle(cycleId);
  }).pipe(Effect.provide(CycleServiceLive));
