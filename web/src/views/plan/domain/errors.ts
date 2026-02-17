/**
 * Plan Domain Errors
 *
 * Typed errors for domain rule violations.
 * Use Data.TaggedError for structured error handling.
 */
import { Data } from 'effect';

/**
 * PlanNotFoundError
 *
 * Thrown when attempting to access a plan that doesn't exist (HTTP 404 from API).
 */
export class PlanNotFoundError extends Data.TaggedError('PlanNotFoundError')<{
  readonly message: string;
  readonly planId: string;
}> {}

/**
 * NoActivePlanError
 *
 * Thrown when loading the active plan but none exists.
 */
export class NoActivePlanError extends Data.TaggedError('NoActivePlanError')<{
  readonly message: string;
}> {}

/**
 * PlanAlreadyActiveError
 *
 * Thrown when creating a plan while another is already active.
 */
export class PlanAlreadyActiveError extends Data.TaggedError('PlanAlreadyActiveError')<{
  readonly message: string;
}> {}

/**
 * ActiveCycleExistsError
 *
 * Thrown when creating a plan while a fasting cycle is in progress.
 */
export class ActiveCycleExistsError extends Data.TaggedError('ActiveCycleExistsError')<{
  readonly message: string;
}> {}

/**
 * PlanInvalidStateError
 *
 * Thrown when operating on a plan in the wrong state
 * (e.g., cancelling an already completed plan).
 */
export class PlanInvalidStateError extends Data.TaggedError('PlanInvalidStateError')<{
  readonly message: string;
  readonly currentState: string;
  readonly expectedState: string;
}> {}

/**
 * InvalidPeriodCountError
 *
 * Thrown when period count is outside the valid range (1-31).
 */
export class InvalidPeriodCountError extends Data.TaggedError('InvalidPeriodCountError')<{
  readonly message: string;
  readonly periodCount: number;
  readonly minPeriods: number;
  readonly maxPeriods: number;
}> {}

/**
 * PeriodsMismatchError
 *
 * Thrown when the provided period count doesn't match the plan's expected count.
 */
export class PeriodsMismatchError extends Data.TaggedError('PeriodsMismatchError')<{
  readonly message: string;
  readonly expectedCount: number;
  readonly receivedCount: number;
}> {}

/**
 * PeriodNotInPlanError
 *
 * Thrown when a referenced period doesn't belong to the specified plan.
 */
export class PeriodNotInPlanError extends Data.TaggedError('PeriodNotInPlanError')<{
  readonly message: string;
  readonly planId: string;
  readonly periodId: string;
}> {}

/**
 * PeriodOverlapWithCycleError
 *
 * Thrown when plan periods overlap with existing cycle records.
 */
export class PeriodOverlapWithCycleError extends Data.TaggedError('PeriodOverlapWithCycleError')<{
  readonly message: string;
  readonly overlappingCycleId: string;
}> {}

/**
 * PeriodsNotCompletedError
 *
 * Thrown when attempting to complete a plan before all periods have finished.
 */
export class PeriodsNotCompletedError extends Data.TaggedError('PeriodsNotCompletedError')<{
  readonly message: string;
  readonly completedCount: number;
  readonly totalCount: number;
}> {}
