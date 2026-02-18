/**
 * Plan API Error Schemas, Type Aliases, and Error Helpers
 *
 * Defines response error schemas for parsing API error bodies,
 * composite error type aliases for each endpoint, and reusable
 * error-handling helpers.
 */
import { ServerError, UnauthorizedError, ValidationError } from '@/services/http/errors';
import { HttpClientResponse } from '@/services/http/http-client.service';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Effect, Schema as S } from 'effect';
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

// ============================================================================
// Error Response Schemas
// ============================================================================

export const PlanApiErrorResponseSchema = S.Struct({
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

export const ErrorResponseSchema = S.Struct({
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
// Error Helpers
// ============================================================================

export const handleNotFoundWithPlanIdResponse = (response: HttpClientResponse.HttpClientResponse, planId: string) =>
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
 * Create a PeriodOverlapWithCycleError or ServerError from parsed error data.
 */
export const failWithPeriodOverlapError = (errorData: {
  message?: string;
  overlappingCycleId?: string;
}): Effect.Effect<never, PeriodOverlapWithCycleError | ServerError> => {
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
};

/**
 * Create a PlanInvalidStateError from parsed error data.
 */
export const failWithPlanInvalidStateError = (
  errorData: { message?: string; currentState?: string; expectedState?: string },
  defaultMessage: string,
) =>
  Effect.fail(
    new PlanInvalidStateError({
      message: errorData.message ?? defaultMessage,
      currentState: errorData.currentState ?? '',
      expectedState: errorData.expectedState ?? 'active',
    }),
  );

/**
 * Parse response body and produce a ValidationError.
 */
export const handleValidationErrorBody = (response: HttpClientResponse.HttpClientResponse, defaultMessage: string) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(PlanApiErrorResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new ValidationError({
              message: errorData.message ?? defaultMessage,
              issues: [],
            }),
          ),
        ),
      ),
    ),
  );
