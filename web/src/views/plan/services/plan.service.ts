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
import { PlanResponseSchema, PlansListResponseSchema, PlanWithPeriodsResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Error Response Schema for parsing API error bodies
 */
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
});

const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

/**
 * Plan Service Error Types
 */
export class PlanNotFoundError extends S.TaggedError<PlanNotFoundError>()('PlanNotFoundError', {
  message: S.String,
  planId: S.String,
}) {}

export class NoActivePlanError extends S.TaggedError<NoActivePlanError>()('NoActivePlanError', {
  message: S.String,
}) {}

export class PlanAlreadyActiveError extends S.TaggedError<PlanAlreadyActiveError>()('PlanAlreadyActiveError', {
  message: S.String,
  userId: S.optional(S.String),
}) {}

export class ActiveCycleExistsError extends S.TaggedError<ActiveCycleExistsError>()('ActiveCycleExistsError', {
  message: S.String,
  userId: S.optional(S.String),
}) {}

export class PlanInvalidStateError extends S.TaggedError<PlanInvalidStateError>()('PlanInvalidStateError', {
  message: S.String,
  currentState: S.String,
  expectedState: S.String,
}) {}

export class InvalidPeriodCountError extends S.TaggedError<InvalidPeriodCountError>()('InvalidPeriodCountError', {
  message: S.String,
  periodCount: S.Number,
  minPeriods: S.Number,
  maxPeriods: S.Number,
}) {}

export class PeriodsMismatchError extends S.TaggedError<PeriodsMismatchError>()('PeriodsMismatchError', {
  message: S.String,
  expectedCount: S.Number,
  receivedCount: S.Number,
}) {}

export class PeriodNotInPlanError extends S.TaggedError<PeriodNotInPlanError>()('PeriodNotInPlanError', {
  message: S.String,
  planId: S.String,
  periodId: S.String,
}) {}

export class PeriodOverlapWithCycleError extends S.TaggedError<PeriodOverlapWithCycleError>()(
  'PeriodOverlapWithCycleError',
  {
    message: S.String,
    overlappingCycleId: S.String,
  },
) {}

/**
 * Request Payload Types
 */
export type PeriodInput = {
  fastingDuration: number;
  eatingWindow: number;
};

export type CreatePlanPayload = {
  startDate: Date;
  periods: PeriodInput[];
};

export type PeriodUpdateInput = {
  id: string;
  fastingDuration: number;
  eatingWindow: number;
};

export type UpdatePeriodsPayload = {
  periods: PeriodUpdateInput[];
};

/**
 * Response Types
 */
export type CreatePlanSuccess = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;
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

export type GetActivePlanSuccess = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;
export type GetActivePlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | NoActivePlanError
  | UnauthorizedError
  | ServerError;

export type GetPlanSuccess = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;
export type GetPlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | UnauthorizedError
  | ServerError;

export type ListPlansSuccess = S.Schema.Type<typeof PlansListResponseSchema>;
export type ListPlansError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

export type CancelPlanSuccess = S.Schema.Type<typeof PlanResponseSchema>;
export type CancelPlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PlanNotFoundError
  | PlanInvalidStateError
  | UnauthorizedError
  | ServerError;

export type UpdatePeriodsSuccess = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;
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

/**
 * Plan-specific Error Response Handlers
 */
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
 * Handle Create Plan Response
 */
const handleCreatePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<CreatePlanSuccess, CreatePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
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
                        userId: errorData.userId,
                      }),
                    ),
                  ),
                  Match.when('ActiveCycleExistsError', () =>
                    Effect.fail(
                      new ActiveCycleExistsError({
                        message: errorData.message ?? 'User has an active cycle in progress',
                        userId: errorData.userId,
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
              message: undefined,
              periodCount: undefined,
              minPeriods: undefined,
              maxPeriods: undefined,
            })),
            Effect.flatMap((errorData) =>
              Effect.fail(
                new InvalidPeriodCountError({
                  message: errorData.message ?? 'Invalid number of periods',
                  periodCount: errorData.periodCount ?? 0,
                  minPeriods: errorData.minPeriods ?? 1,
                  maxPeriods: errorData.maxPeriods ?? 31,
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
 * Handle Get Active Plan Response
 */
const handleGetActivePlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<GetActivePlanSuccess, GetActivePlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
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
 * Handle Get Plan Response
 */
const handleGetPlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<GetPlanSuccess, GetPlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
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
 * Handle List Plans Response
 */
const handleListPlansResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ListPlansSuccess, ListPlansError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlansListResponseSchema)(response).pipe(
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
 * Handle Cancel Plan Response
 */
const handleCancelPlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<CancelPlanSuccess, CancelPlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanResponseSchema)(response).pipe(
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
 * Handle Update Plan Periods Response
 */
const handleUpdatePeriodsResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planId: string,
): Effect.Effect<UpdatePeriodsSuccess, UpdatePeriodsError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanWithPeriodsResponseSchema)(response).pipe(
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
 * Plan Service
 */
export class PlanService extends Effect.Service<PlanService>()('PlanService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Create a new plan with periods
       * @param payload - The plan creation payload with startDate and periods
       */
      createPlan: (payload: CreatePlanPayload): Effect.Effect<CreatePlanSuccess, CreatePlanError> =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/plans`).pipe(
          HttpClientRequest.bodyJson(payload),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleCreatePlanResponse(response)),
        ),

      /**
       * Get the current active plan for the authenticated user
       */
      getActivePlan: (): Effect.Effect<GetActivePlanSuccess, GetActivePlanError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans/active`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetActivePlanResponse(response)),
        ),

      /**
       * Get a specific plan by ID
       * @param planId - The plan ID
       */
      getPlan: (planId: string): Effect.Effect<GetPlanSuccess, GetPlanError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans/${planId}`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleGetPlanResponse(response, planId)),
        ),

      /**
       * List all plans for the authenticated user
       */
      listPlans: (): Effect.Effect<ListPlansSuccess, ListPlansError> =>
        authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plans`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleListPlansResponse(response)),
        ),

      /**
       * Cancel a specific plan
       * @param planId - The plan ID to cancel
       */
      cancelPlan: (planId: string): Effect.Effect<CancelPlanSuccess, CancelPlanError> =>
        authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plans/${planId}/cancel`)).pipe(
          Effect.scoped,
          Effect.flatMap((response) => handleCancelPlanResponse(response, planId)),
        ),

      /**
       * Update the periods of a specific plan
       * @param planId - The plan ID
       * @param payload - The periods update payload
       */
      updatePlanPeriods: (
        planId: string,
        payload: UpdatePeriodsPayload,
      ): Effect.Effect<UpdatePeriodsSuccess, UpdatePeriodsError> =>
        HttpClientRequest.put(`${API_BASE_URL}/v1/plans/${planId}/periods`).pipe(
          HttpClientRequest.bodyJson(payload),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdatePeriodsResponse(response, planId)),
        ),
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}

/**
 * Live implementation of PlanService
 */
export const PlanServiceLive = PlanService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

/**
 * Program to create a new plan
 */
export const programCreatePlan = (payload: CreatePlanPayload) =>
  PlanService.createPlan(payload).pipe(
    Effect.tapError((error) => Effect.logError('Failed to create plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );

/**
 * Program to get the active plan
 */
export const programGetActivePlan = () =>
  PlanService.getActivePlan().pipe(
    Effect.tapError((error) => Effect.logError('Failed to get active plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );

/**
 * Program to get a plan by ID
 */
export const programGetPlan = (planId: string) =>
  PlanService.getPlan(planId).pipe(
    Effect.tapError((error) => Effect.logError('Failed to get plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );

/**
 * Program to list all plans
 */
export const programListPlans = () =>
  PlanService.listPlans().pipe(
    Effect.tapError((error) => Effect.logError('Failed to list plans', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );

/**
 * Program to cancel a plan
 */
export const programCancelPlan = (planId: string) =>
  PlanService.cancelPlan(planId).pipe(
    Effect.tapError((error) => Effect.logError('Failed to cancel plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );

/**
 * Program to update plan periods
 */
export const programUpdatePlanPeriods = (planId: string, payload: UpdatePeriodsPayload) =>
  PlanService.updatePlanPeriods(planId, payload).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update plan periods', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanService' }),
    Effect.provide(PlanServiceLive),
  );
