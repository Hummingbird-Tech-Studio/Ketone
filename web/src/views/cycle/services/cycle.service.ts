import {
  extractErrorMessage,
  handleServerErrorResponse,
  handleUnauthorizedResponse,
  ServerError,
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
import {
  AdjacentCycleSchema,
  CycleDetailResponseSchema,
  CycleExportResponseSchema,
  CycleResponseSchema,
  type AdjacentCycle,
} from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Error Response Schemas for safe JSON parsing
 */
const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

const CycleNotFoundResponseSchema = S.Struct({
  message: S.optional(S.String),
});

const ApiErrorResponseSchema = S.Struct({
  _tag: S.optional(S.String),
  message: S.optional(S.String),
  userId: S.optional(S.String),
  newStartDate: S.optional(S.String),
  lastCompletedEndDate: S.optional(S.String),
  requestedCycleId: S.optional(S.String),
  activeCycleId: S.optional(S.String),
  currentState: S.optional(S.String),
  expectedState: S.optional(S.String),
  currentCount: S.optional(S.Number),
});

const UnsupportedMediaTypeResponseSchema = S.Struct({
  _tag: S.optional(S.String),
  message: S.optional(S.String),
  acceptHeader: S.optional(S.String),
  supportedTypes: S.optional(S.Array(S.String)),
});

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

export class FeelingsLimitExceededError extends S.TaggedError<FeelingsLimitExceededError>()(
  'FeelingsLimitExceededError',
  {
    message: S.String,
    cycleId: S.String,
    currentCount: S.Number,
  },
) {}

export class UnsupportedMediaTypeError extends S.TaggedError<UnsupportedMediaTypeError>()('UnsupportedMediaTypeError', {
  message: S.String,
  acceptHeader: S.String,
  supportedTypes: S.Array(S.String),
}) {}

/**
 * Cycle-specific Error Response Handlers
 */
const handleNotFoundWithCycleIdResponse = (response: HttpClientResponse.HttpClientResponse, cycleId: string) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(CycleNotFoundResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new CycleNotFoundError({
              message: errorData.message ?? 'Cycle not found',
              cycleId,
            }),
          ),
        ),
      ),
    ),
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

export type UpdateCycleNotesSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type UpdateCycleNotesError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleNotFoundError
  | UnauthorizedError
  | ServerError;

export type UpdateCycleFeelingsSuccess = S.Schema.Type<typeof CycleResponseSchema>;
export type UpdateCycleFeelingsError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | CycleNotFoundError
  | FeelingsLimitExceededError
  | UnauthorizedError
  | ServerError;

export type ExportCyclesJsonSuccess = S.Schema.Type<typeof CycleExportResponseSchema>;
export type ExportCyclesJsonError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

export type ExportCyclesCsvSuccess = string;
export type ExportCyclesCsvError =
  | HttpClientError
  | HttpBodyError
  | UnsupportedMediaTypeError
  | UnauthorizedError
  | ServerError;

export type GetLastCompletedCycleSuccess = AdjacentCycle | null;
export type GetLastCompletedCycleError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
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
        Effect.flatMap((body) =>
          S.decodeUnknown(ErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new NoCycleInProgressError({
                  message: errorData.message ?? 'No active cycle in progress',
                }),
              ),
            ),
          ),
        ),
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
        Effect.flatMap((body) =>
          S.decodeUnknown(ApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ _tag: undefined, message: undefined })),
            Effect.flatMap(
              (errorData): Effect.Effect<never, CycleAlreadyInProgressError | CycleOverlapError | ServerError> => {
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
              },
            ),
          ),
        ),
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
        Effect.flatMap((body) =>
          S.decodeUnknown(ApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ _tag: undefined, message: undefined })),
            Effect.flatMap(
              (
                errorData,
              ): Effect.Effect<
                never,
                CycleIdMismatchError | CycleInvalidStateError | CycleOverlapError | ServerError
              > => {
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
        Effect.flatMap((body) =>
          S.decodeUnknown(ApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              currentState: undefined,
              expectedState: undefined,
            })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new CycleInvalidStateError({
                  message: errorData.message ?? 'Cannot delete a cycle that is not completed',
                  currentState: errorData.currentState ?? '',
                  expectedState: errorData.expectedState ?? 'Completed',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Update Cycle Notes Response
 */
const handleUpdateCycleNotesResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<UpdateCycleNotesSuccess, UpdateCycleNotesError> =>
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
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Update Cycle Feelings Response
 */
const handleUpdateCycleFeelingsResponse = (
  response: HttpClientResponse.HttpClientResponse,
  cycleId: string,
): Effect.Effect<UpdateCycleFeelingsSuccess, UpdateCycleFeelingsError> =>
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
    Match.when(HttpStatus.UnprocessableEntity, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(ApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined, currentCount: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new FeelingsLimitExceededError({
                  message: errorData.message ?? 'Too many feelings for this cycle',
                  cycleId,
                  currentCount: errorData.currentCount ?? 0,
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Export Cycles JSON Response
 */
const handleExportCyclesJsonResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ExportCyclesJsonSuccess, ExportCyclesJsonError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(CycleExportResponseSchema)(response).pipe(
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
 * Handle Export Cycles CSV Response
 */
const handleExportCyclesCsvResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ExportCyclesCsvSuccess, ExportCyclesCsvError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => response.text),
    Match.when(HttpStatus.NotAcceptable, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(UnsupportedMediaTypeResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined, acceptHeader: undefined, supportedTypes: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new UnsupportedMediaTypeError({
                  message: errorData.message ?? 'Unsupported media type',
                  acceptHeader: errorData.acceptHeader ?? 'text/csv',
                  supportedTypes: errorData.supportedTypes ?? ['application/json', 'text/csv'],
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Get Last Completed Cycle Response
 */
const handleGetLastCompletedCycleResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<GetLastCompletedCycleSuccess, GetLastCompletedCycleError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(S.NullOr(AdjacentCycleSchema))(response).pipe(
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

      /**
       * Update the notes of a cycle
       * @param cycleId - The cycle ID
       * @param notes - The notes to set (max 1000 characters)
       */
      updateCycleNotes: (
        cycleId: string,
        notes: string,
      ): Effect.Effect<UpdateCycleNotesSuccess, UpdateCycleNotesError> =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/cycles/${cycleId}/notes`).pipe(
          HttpClientRequest.bodyJson({ notes }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdateCycleNotesResponse(response, cycleId)),
        ),

      /**
       * Update the feelings of a cycle
       * @param cycleId - The cycle ID
       * @param feelings - Array of feelings to set (max 3, no duplicates)
       */
      updateCycleFeelings: (
        cycleId: string,
        feelings: string[],
      ): Effect.Effect<UpdateCycleFeelingsSuccess, UpdateCycleFeelingsError> =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/cycles/${cycleId}/feelings`).pipe(
          HttpClientRequest.bodyJson({ feelings }),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdateCycleFeelingsResponse(response, cycleId)),
        ),

      /**
       * Export all cycles as JSON
       */
      exportCyclesJson: (): Effect.Effect<ExportCyclesJsonSuccess, ExportCyclesJsonError> =>
        authenticatedClient
          .execute(
            HttpClientRequest.get(`${API_BASE_URL}/v1/cycles/export`).pipe(
              HttpClientRequest.setHeader('Accept', 'application/json'),
            ),
          )
          .pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleExportCyclesJsonResponse(response)),
          ),

      /**
       * Export all cycles as CSV
       */
      exportCyclesCsv: (): Effect.Effect<ExportCyclesCsvSuccess, ExportCyclesCsvError> =>
        authenticatedClient
          .execute(
            HttpClientRequest.get(`${API_BASE_URL}/v1/cycles/export`).pipe(
              HttpClientRequest.setHeader('Accept', 'text/csv'),
            ),
          )
          .pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleExportCyclesCsvResponse(response)),
          ),

      /**
       * Get the last completed cycle
       * Returns null if no completed cycles exist
       */
      getLastCompletedCycle: (): Effect.Effect<GetLastCompletedCycleSuccess, GetLastCompletedCycleError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/cycles/last-completed`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetLastCompletedCycleResponse(response)),
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
export const programGetCycle = (cycleId: string) =>
  CycleService.getCycle(cycleId).pipe(
    Effect.tapError((error) => Effect.logError('Failed to get cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to get the active cycle in progress
 */
export const programGetActiveCycle = () =>
  CycleService.getActiveCycle().pipe(
    Effect.tapError((error) => Effect.logError('Failed to get active cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to create a new cycle
 */
export const programCreateCycle = (startDate: Date, endDate: Date) =>
  CycleService.createCycle(startDate, endDate).pipe(
    Effect.tapError((error) => Effect.logError('Failed to create cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to update an existing cycle's dates
 */
export const programUpdateCycle = (cycleId: string, startDate: Date, endDate: Date) =>
  CycleService.updateCycle(cycleId, startDate, endDate).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to update an existing completed cycle's dates
 */
export const programUpdateCompletedCycle = (cycleId: string, startDate: Date, endDate: Date) =>
  CycleService.updateCompletedCycle(cycleId, startDate, endDate).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update completed cycle', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to complete an existing cycle
 */
export const programCompleteCycle = (cycleId: string, startDate: Date, endDate: Date) =>
  CycleService.completeCycle(cycleId, startDate, endDate).pipe(
    Effect.tapError((error) => Effect.logError('Failed to complete cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to delete a completed cycle
 */
export const programDeleteCycle = (cycleId: string) =>
  CycleService.deleteCycle(cycleId).pipe(
    Effect.tapError((error) => Effect.logError('Failed to delete cycle', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to update the notes of a cycle
 */
export const programUpdateCycleNotes = (cycleId: string, notes: string) =>
  CycleService.updateCycleNotes(cycleId, notes).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update cycle notes', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to update the feelings of a cycle
 */
export const programUpdateCycleFeelings = (cycleId: string, feelings: string[]) =>
  CycleService.updateCycleFeelings(cycleId, feelings).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update cycle feelings', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to export cycles as JSON
 */
export const programExportCyclesJson = () =>
  CycleService.exportCyclesJson().pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to export cycles as JSON', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to export cycles as CSV
 */
export const programExportCyclesCsv = () =>
  CycleService.exportCyclesCsv().pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to export cycles as CSV', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );

/**
 * Program to get the last completed cycle
 */
export const programGetLastCompletedCycle = () =>
  CycleService.getLastCompletedCycle().pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to get last completed cycle', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'CycleService' }),
    Effect.provide(CycleServiceLive),
  );
