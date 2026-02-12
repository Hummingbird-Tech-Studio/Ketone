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
 *   - Collection: Gateway fetches from API (THIS FILE)
 *   - Logic: FC pure functions (domain/services/)
 *   - Persistence: Gateway writes to API (THIS FILE)
 */
import {
  handleServerErrorResponse,
  handleUnauthorizedResponse,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import {
  type PeriodResponse,
  PlanResponseSchema,
  PlansListResponseSchema,
  type PlanResponse,
  type PlanWithPeriodsResponse,
  PlanWithPeriodsResponseSchema,
} from '@ketone/shared';
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
  PlanNotFoundError,
} from '../domain/errors';
import {
  EatingWindow,
  FastingDuration,
  PeriodCount,
  PeriodOrder,
  PlanDescription,
  PlanName,
  type PeriodId,
  type PlanDetail,
  PlanDetail as PlanDetailClass,
  type PlanId,
  type PlanPeriod,
  PlanPeriod as PlanPeriodClass,
  type PlanSummary,
  PlanSummary as PlanSummaryClass,
} from '../domain/plan.model';
import type { CreatePlanInput } from '../domain/contracts/create-plan.contract';
import type { UpdateMetadataInput } from '../domain/contracts/update-metadata.contract';
import type { UpdatePeriodsInput } from '../domain/contracts/update-periods.contract';

// ============================================================================
// Boundary Mappers — DTO ↔ Domain
// ============================================================================

/**
 * Map a period DTO to a PlanPeriod domain type.
 * Branded types are applied during mapping.
 */
const fromPeriodResponse = (dto: PeriodResponse): PlanPeriod =>
  new PlanPeriodClass({
    id: dto.id as PeriodId,
    planId: dto.planId as PlanId,
    order: PeriodOrder(dto.order),
    fastingDuration: FastingDuration(dto.fastingDuration),
    eatingWindow: EatingWindow(dto.eatingWindow),
    startDate: dto.startDate,
    endDate: dto.endDate,
    fastingStartDate: dto.fastingStartDate,
    fastingEndDate: dto.fastingEndDate,
    eatingStartDate: dto.eatingStartDate,
    eatingEndDate: dto.eatingEndDate,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map a plan response DTO to a PlanSummary domain type.
 * Used for list endpoints.
 */
const fromPlanResponse = (dto: PlanResponse): PlanSummary =>
  new PlanSummaryClass({
    id: dto.id as PlanId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    status: dto.status,
    startDate: dto.startDate,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map a plan-with-periods DTO to a PlanDetail domain type.
 */
const fromPlanWithPeriodsResponse = (dto: PlanWithPeriodsResponse): PlanDetail =>
  new PlanDetailClass({
    id: dto.id as PlanId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    status: dto.status,
    startDate: dto.startDate,
    periodCount: PeriodCount(dto.periods.length),
    periods: dto.periods.map(fromPeriodResponse),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map domain CreatePlanInput to API payload.
 * Pure function — always succeeds.
 */
const toCreatePlanPayload = (input: CreatePlanInput) => ({
  name: input.name as string,
  description: (input.description as string | null) ?? undefined,
  startDate: input.startDate,
  periods: input.periods.map((p) => ({
    fastingDuration: p.fastingDuration as number,
    eatingWindow: p.eatingWindow as number,
  })),
});

/**
 * Map domain UpdateMetadataInput to API payload.
 * Only includes fields that are defined.
 */
const toUpdateMetadataPayload = (input: UpdateMetadataInput) => {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name as string;
  if (input.description !== undefined) payload.description = (input.description as string | null) ?? '';
  if (input.startDate !== undefined) payload.startDate = input.startDate;
  return payload;
};

/**
 * Map domain UpdatePeriodsInput to API payload.
 */
const toUpdatePeriodsPayload = (input: UpdatePeriodsInput) => ({
  periods: input.periods.map((p) => ({
    ...(p.id !== undefined ? { id: p.id as string } : {}),
    fastingDuration: p.fastingDuration as number,
    eatingWindow: p.eatingWindow as number,
  })),
});

// ============================================================================
// Error Response Schemas
// ============================================================================

const PlanApiErrorResponseSchema = S.Struct({
  _tag: S.optional(S.String),
  message: S.optional(S.String),
  userId: S.optional(S.String),
  planId: S.optional(S.String),
  periodId: S.optional(S.String),
  currentState: S.optional(S.String),
  expectedState: S.optional(S.String),
  periodCount: S.optional(S.Number),
  minPeriods: S.optional(S.Number),
  maxPeriods: S.optional(S.Number),
  expectedCount: S.optional(S.Number),
  receivedCount: S.optional(S.Number),
  overlappingCycleId: S.optional(S.String),
  completedCount: S.optional(S.Number),
  totalCount: S.optional(S.Number),
});

const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

// ============================================================================
// Error Type Aliases
// ============================================================================

export type CreatePlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanAlreadyActiveError
  | ActiveCycleExistsError
  | PeriodOverlapWithCycleError
  | InvalidPeriodCountError
  | UnauthorizedError
  | ServerError;

export type GetActivePlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | NoActivePlanError
  | UnauthorizedError
  | ServerError;

export type GetPlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | UnauthorizedError
  | ServerError;

export type ListPlansError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

export type CancelPlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | PlanInvalidStateError
  | UnauthorizedError
  | ServerError;

export type CompletePlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | PlanInvalidStateError
  | PeriodsNotCompletedError
  | UnauthorizedError
  | ServerError;

export type UpdatePeriodsError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | PeriodsMismatchError
  | PeriodNotInPlanError
  | PeriodOverlapWithCycleError
  | UnauthorizedError
  | ServerError;

export type UpdateMetadataError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | PlanInvalidStateError
  | PeriodOverlapWithCycleError
  | UnauthorizedError
  | ServerError;

// ============================================================================
// Response Handlers
// ============================================================================

const handleNotFoundWithPlanIdResponse = (response: HttpClientResponse.HttpClientResponse, planId: string) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(ErrorResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new PlanNotFoundError({
              message: errorData.message ?? 'Plan not found',
              planId,
            }),
          ),
        ),
      ),
    ),
  );

/**
 * Handle Create Plan Response — 201 Created → PlanDetail
 */
const handleCreatePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<PlanDetail, CreatePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromPlanWithPeriodsResponse),
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
                  Match.when('PeriodOverlapWithCycleError', () => {
                    if (!errorData.overlappingCycleId) {
                      return Effect.fail(
                        new ServerError({
                          message: 'Missing overlappingCycleId in PeriodOverlapWithCycleError',
                        }),
                      );
                    }
                    return Effect.fail(
                      new PeriodOverlapWithCycleError({
                        message: errorData.message ?? 'Plan periods overlap with existing cycles',
                        overlappingCycleId: errorData.overlappingCycleId,
                      }),
                    );
                  }),
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
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromPlanWithPeriodsResponse),
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
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromPlanWithPeriodsResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
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
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanResponseSchema)(response).pipe(
        Effect.map(fromPlanResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
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
              Effect.fail(
                new PlanInvalidStateError({
                  message: errorData.message ?? 'Cannot cancel plan in current state',
                  currentState: errorData.currentState ?? '',
                  expectedState: errorData.expectedState ?? 'active',
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
 * Handle Complete Plan Response — 200 OK → PlanSummary
 */
const handleCompletePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<PlanSummary, CompletePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanResponseSchema)(response).pipe(
        Effect.map(fromPlanResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
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
                  return Effect.fail(
                    new PlanInvalidStateError({
                      message: errorData.message ?? 'Cannot complete plan in current state',
                      currentState: errorData.currentState ?? '',
                      expectedState: errorData.expectedState ?? 'active',
                    }),
                  );
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
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromPlanWithPeriodsResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () => handleNotFoundWithPlanIdResponse(response, planId)),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ _tag: undefined, message: undefined, overlappingCycleId: undefined })),
            Effect.flatMap((errorData): Effect.Effect<never, PeriodOverlapWithCycleError | ServerError> => {
              if (errorData._tag === 'PeriodOverlapWithCycleError') {
                if (!errorData.overlappingCycleId) {
                  return Effect.fail(
                    new ServerError({
                      message: 'Missing overlappingCycleId in PeriodOverlapWithCycleError',
                    }),
                  );
                }
                return Effect.fail(
                  new PeriodOverlapWithCycleError({
                    message: errorData.message ?? 'Plan periods overlap with existing cycles',
                    overlappingCycleId: errorData.overlappingCycleId,
                  }),
                );
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
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromPlanWithPeriodsResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
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
                  return Effect.fail(
                    new PlanInvalidStateError({
                      message: errorData.message ?? 'Cannot update plan metadata in current state',
                      currentState: errorData.currentState ?? '',
                      expectedState: errorData.expectedState ?? 'active',
                    }),
                  );
                }

                if (errorData._tag === 'PeriodOverlapWithCycleError') {
                  if (!errorData.overlappingCycleId) {
                    return Effect.fail(
                      new ServerError({
                        message: 'Missing overlappingCycleId in PeriodOverlapWithCycleError',
                      }),
                    );
                  }

                  return Effect.fail(
                    new PeriodOverlapWithCycleError({
                      message: errorData.message ?? 'Plan periods overlap with existing cycles',
                      overlappingCycleId: errorData.overlappingCycleId,
                    }),
                  );
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
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new ValidationError({
                  message: errorData.message ?? 'Invalid request',
                  issues: [],
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    Match.when(HttpStatus.UnprocessableEntity, () =>
      response.json.pipe(
        Effect.flatMap((body) =>
          S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
            Effect.orElseSucceed(() => ({ message: undefined })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new ValidationError({
                  message: errorData.message ?? 'Validation failed',
                  issues: [],
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
      cancelPlan: (planId: PlanId): Effect.Effect<PlanSummary, CancelPlanError> =>
        authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plans/${planId}/cancel`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleCancelPlanResponse(response, planId)),
        ),

      /**
       * Complete a specific plan.
       * Returns domain PlanSummary (completed plan summary).
       */
      completePlan: (planId: PlanId): Effect.Effect<PlanSummary, CompletePlanError> =>
        authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plans/${planId}/complete`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleCompletePlanResponse(response, planId)),
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
