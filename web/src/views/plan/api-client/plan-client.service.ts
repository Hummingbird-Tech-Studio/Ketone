/**
 * Plan API Client Service
 *
 * IMPERATIVE SHELL — HTTP + boundary mappers (DTO → domain types)
 *
 * This is the web equivalent of the repository layer. All methods return
 * domain types, never raw DTOs. Boundary mappers are applied at the API client
 * boundary. HTTP errors are mapped to domain-tagged errors.
 *
 * Three Phases pattern:
 *   - Collection: API client fetches from API (THIS FILE)
 *   - Logic: FC pure functions (domain/services/)
 *   - Persistence: API client writes to API (THIS FILE)
 */
import {
  handleServerErrorResponse,
  handleUnauthorizedResponse,
  ServerError,
  ValidationError,
} from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type {
  CancelPlanInput,
  CompletePlanInput,
  CreatePlanInput,
  PlanDetail,
  PlanId,
  PlanSummary,
  UpdateMetadataInput,
  UpdatePeriodsInput,
} from '@/views/plan/domain';
import { PlanResponseSchema, PlansListResponseSchema, PlanWithPeriodsResponseSchema } from '@ketone/shared';
import { Effect, Match, Schema as S } from 'effect';
import {
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  NoActivePlanError,
  PeriodNotInPlanError,
  PeriodOverlapWithCycleError,
  PeriodsMismatchError,
  PeriodsNotCompletedError,
  PlanAlreadyActiveError,
  PlanInvalidStateError,
} from '../domain/errors';
import {
  type CancelPlanError,
  type CompletePlanError,
  type CreatePlanError,
  ErrorResponseSchema,
  failWithPeriodOverlapError,
  failWithPlanInvalidStateError,
  type GetActivePlanError,
  type GetPlanError,
  handleNotFoundWithPlanIdResponse,
  handleValidationErrorBody,
  type ListPlansError,
  PlanApiErrorResponseSchema,
  type UpdateMetadataError,
  type UpdatePeriodsError,
} from './plan.errors';
import {
  fromPlanResponse,
  fromPlanWithPeriodsResponse,
  toCreatePlanPayload,
  toUpdateMetadataPayload,
  toUpdatePeriodsPayload,
} from './plan.mappers';

// ============================================================================
// Response Decoders
// ============================================================================

/**
 * Decode response body as PlanDetail using PlanWithPeriodsResponseSchema.
 */
const decodePlanDetailBody = (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
    Effect.map(fromPlanWithPeriodsResponse),
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: 'Invalid response from server',
          issues: [error],
        }),
    ),
  );

/**
 * Decode response body as PlanSummary using PlanResponseSchema.
 */
const decodePlanSummaryBody = (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(PlanResponseSchema)(response).pipe(
    Effect.map(fromPlanResponse),
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: 'Invalid response from server',
          issues: [error],
        }),
    ),
  );

// ============================================================================
// Response Handlers
// ============================================================================

/**
 * Handle Create Plan Response — 201 Created → PlanDetail
 */
const handleCreatePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<PlanDetail, CreatePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () => decodePlanDetailBody(response)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ _tag: undefined, message: undefined })),
            Effect.flatMap(
              (
                errorData,
              ): Effect.Effect<
                never,
                PlanAlreadyActiveError | ActiveCycleExistsError | PeriodOverlapWithCycleError | ServerError
              > => {
                if (!errorData._tag) {
                  return Effect.fail(
                    new ServerError({
                      message: errorData.message ?? 'Unexpected conflict response',
                    }),
                  );
                }

                return Match.value(errorData._tag).pipe(
                  Match.when('PlanAlreadyActiveError', () =>
                    Effect.fail(
                      new PlanAlreadyActiveError({
                        message: errorData.message ?? 'User already has an active plan',
                      }),
                    ),
                  ),
                  Match.when('ActiveCycleExistsError', () =>
                    Effect.fail(
                      new ActiveCycleExistsError({
                        message: errorData.message ?? 'User has an active cycle in progress',
                      }),
                    ),
                  ),
                  Match.when('PeriodOverlapWithCycleError', () => failWithPeriodOverlapError(errorData)),
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
    Match.when(HttpStatus.UnprocessableEntity, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              periodCount: undefined,
              minPeriods: undefined,
              maxPeriods: undefined,
            })),
            Effect.flatMap((errorData): Effect.Effect<never, InvalidPeriodCountError | ValidationError> => {
              const isPeriodError =
                errorData._tag === 'InvalidPeriodCountError' ||
                errorData.periodCount !== undefined ||
                errorData.minPeriods !== undefined ||
                errorData.maxPeriods !== undefined;

              if (isPeriodError) {
                return Effect.fail(
                  new InvalidPeriodCountError({
                    message: errorData.message ?? 'Invalid number of periods',
                    periodCount: errorData.periodCount ?? 0,
                    minPeriods: errorData.minPeriods ?? 1,
                    maxPeriods: errorData.maxPeriods ?? 31,
                  }),
                );
              }

              return Effect.fail(
                new ValidationError({
                  message: errorData.message ?? 'Validation failed',
                  issues: [],
                }),
              );
            }),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Get Active Plan Response — 200 OK → PlanDetail
 */
const handleGetActivePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<PlanDetail, GetActivePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanDetailBody(response)),
    Match.when(HttpStatus.NotFound, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(ErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new NoActivePlanError({
                  message: errorData.message ?? 'No active plan found',
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
 * Handle Get Plan Response — 200 OK → PlanDetail
 */
const handleGetPlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanDetail, GetPlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanDetailBody(response)),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle List Plans Response — 200 OK → PlanSummary[]
 */
const handleListPlansResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ReadonlyArray<PlanSummary>, ListPlansError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlansListResponseSchema)(response).pipe(
        Effect.map((dtos) => dtos.map(fromPlanResponse)),
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
 * Handle Cancel Plan Response — 200 OK → PlanSummary
 */
const handleCancelPlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanSummary, CancelPlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanSummaryBody(response)),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              currentState: undefined,
              expectedState: undefined,
            })),
            Effect.flatMap((errorData) =>
              failWithPlanInvalidStateError(errorData, 'Cannot cancel plan in current state'),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Complete Plan Response — 200 OK → PlanSummary
 */
const handleCompletePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanSummary, CompletePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanSummaryBody(response)),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              currentState: undefined,
              expectedState: undefined,
              completedCount: undefined,
              totalCount: undefined,
            })),
            Effect.flatMap(
              (errorData): Effect.Effect<never, PlanInvalidStateError | PeriodsNotCompletedError | ServerError> => {
                if (errorData._tag === 'PeriodsNotCompletedError') {
                  return Effect.fail(
                    new PeriodsNotCompletedError({
                      message: errorData.message ?? 'Not all periods have been completed',
                      completedCount: errorData.completedCount ?? 0,
                      totalCount: errorData.totalCount ?? 0,
                    }),
                  );
                }

                if (errorData._tag === 'PlanInvalidStateError') {
                  return failWithPlanInvalidStateError(errorData, 'Cannot complete plan in current state');
                }

                return Effect.fail(
                  new ServerError({
                    message: errorData.message ?? 'Unexpected conflict response',
                  }),
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
 * Handle Update Periods Response — 200 OK → PlanDetail
 */
const handleUpdatePeriodsResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanDetail, UpdatePeriodsError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanDetailBody(response)),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ _tag: undefined, message: undefined, overlappingCycleId: undefined })),
            Effect.flatMap((errorData): Effect.Effect<never, PeriodOverlapWithCycleError | ServerError> => {
              if (errorData._tag === 'PeriodOverlapWithCycleError') {
                return failWithPeriodOverlapError(errorData);
              }
              return Effect.fail(
                new ServerError({
                  message: errorData.message ?? 'Unexpected conflict response',
                }),
              );
            }),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.UnprocessableEntity, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              planId: undefined,
              periodId: undefined,
              expectedCount: undefined,
              receivedCount: undefined,
            })),
            Effect.flatMap(
              (errorData): Effect.Effect<never, PeriodsMismatchError | PeriodNotInPlanError | ServerError> => {
                if (!errorData._tag) {
                  return Effect.fail(
                    new ServerError({
                      message: errorData.message ?? 'Unexpected unprocessable entity response',
                    }),
                  );
                }

                return Match.value(errorData._tag).pipe(
                  Match.when('PeriodsMismatchError', () =>
                    Effect.fail(
                      new PeriodsMismatchError({
                        message: errorData.message ?? 'Period count mismatch',
                        expectedCount: errorData.expectedCount ?? 0,
                        receivedCount: errorData.receivedCount ?? 0,
                      }),
                    ),
                  ),
                  Match.when('PeriodNotInPlanError', () =>
                    Effect.fail(
                      new PeriodNotInPlanError({
                        message: errorData.message ?? 'Period does not belong to this plan',
                        planId: errorData.planId ?? planId,
                        periodId: errorData.periodId ?? '',
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
 * Handle Update Metadata Response — 200 OK → PlanDetail
 */
const handleUpdateMetadataResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanDetail, UpdateMetadataError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () => decodePlanDetailBody(response)),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({
              _tag: undefined,
              message: undefined,
              currentState: undefined,
              expectedState: undefined,
              overlappingCycleId: undefined,
            })),
            Effect.flatMap(
              (errorData): Effect.Effect<never, PlanInvalidStateError | PeriodOverlapWithCycleError | ServerError> => {
                if (errorData._tag === 'PlanInvalidStateError') {
                  return failWithPlanInvalidStateError(errorData, 'Cannot update plan metadata in current state');
                }

                if (errorData._tag === 'PeriodOverlapWithCycleError') {
                  return failWithPeriodOverlapError(errorData);
                }

                return Effect.fail(
                  new ServerError({
                    message: errorData.message ?? 'Unexpected conflict response',
                  }),
                );
              },
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () => handleValidationErrorBody(response, 'Invalid request')),
    Match.when(HttpStatus.UnprocessableEntity, () => handleValidationErrorBody(response, 'Validation failed')),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

// ============================================================================
// API Client Service — Effect.Service
// ============================================================================

export class PlanApiClientService extends Effect.Service<PlanApiClientService>()('PlanApiClientService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Create a new plan with periods.
       * Returns domain PlanDetail, never raw DTO.
       */
      createPlan: (input: CreatePlanInput): Effect.Effect<PlanDetail, CreatePlanError> =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/plans`).pipe(
          HttpClientRequest.bodyJson(toCreatePlanPayload(input)),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleCreatePlanResponse),
        ),

      /**
       * Get the current active plan for the authenticated user.
       * Returns domain PlanDetail, never raw DTO.
       */
      getActivePlan: (): Effect.Effect<PlanDetail, GetActivePlanError> =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans/active`))
          .pipe(Effect.scoped, Effect.flatMap(handleGetActivePlanResponse)),

      /**
       * Get a specific plan by ID.
       * Returns domain PlanDetail, never raw DTO.
       */
      getPlan: (planId: PlanId): Effect.Effect<PlanDetail, GetPlanError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans/${planId}`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetPlanResponse(response, planId)),
        ),

      /**
       * List all plans for the authenticated user.
       * Returns domain PlanSummary[], never raw DTOs.
       */
      listPlans: (): Effect.Effect<ReadonlyArray<PlanSummary>, ListPlansError> =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans`))
          .pipe(Effect.scoped, Effect.flatMap(handleListPlansResponse)),

      /**
       * Cancel a specific plan.
       * Returns domain PlanSummary (cancelled plan summary).
       */
      cancelPlan: (input: CancelPlanInput): Effect.Effect<PlanSummary, CancelPlanError> =>
        authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plans/${input.planId}/cancel`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleCancelPlanResponse(response, input.planId)),
        ),

      /**
       * Complete a specific plan.
       * Returns domain PlanSummary (completed plan summary).
       */
      completePlan: (input: CompletePlanInput): Effect.Effect<PlanSummary, CompletePlanError> =>
        authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plans/${input.planId}/complete`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleCompletePlanResponse(response, input.planId)),
        ),

      /**
       * Update the periods of a specific plan.
       * Returns domain PlanDetail with updated periods.
       */
      updatePlanPeriods: (input: UpdatePeriodsInput): Effect.Effect<PlanDetail, UpdatePeriodsError> =>
        HttpClientRequest.put(`${API_BASE_URL}/v1/plans/${input.planId}/periods`).pipe(
          HttpClientRequest.bodyJson(toUpdatePeriodsPayload(input)),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdatePeriodsResponse(response, input.planId)),
        ),

      /**
       * Update plan metadata (name, description, startDate).
       * Returns domain PlanDetail with updated metadata.
       */
      updatePlanMetadata: (input: UpdateMetadataInput): Effect.Effect<PlanDetail, UpdateMetadataError> =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/plans/${input.planId}`).pipe(
          HttpClientRequest.bodyJson(toUpdateMetadataPayload(input)),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdateMetadataResponse(response, input.planId)),
        ),
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}
