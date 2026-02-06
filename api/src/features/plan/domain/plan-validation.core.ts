import { Effect } from 'effect';
import { PlanInvalidStateError, InvalidPeriodCountError } from './errors';
import { type PlanStatus, type PeriodDateRange, isValidPeriodDateRange, MIN_PERIODS, MAX_PERIODS } from './plan.model';

/**
 * Pure validation functions for the Plan domain.
 * No I/O — all functions are deterministic and testable.
 */

/**
 * BR-01: Assert that a plan is in InProgress state.
 * All mutating operations (update metadata, update periods, cancel, complete)
 * require this precondition (spec §4.2, §4.3, §4.4, §4.5).
 */
export const assertPlanIsInProgress = (status: PlanStatus): Effect.Effect<void, PlanInvalidStateError> =>
  status === 'InProgress'
    ? Effect.void
    : Effect.fail(
        new PlanInvalidStateError({
          message: `Plan must be InProgress to perform this operation, but is ${status}`,
          currentState: status,
          expectedState: 'InProgress',
        }),
      );

/**
 * Validate that the period count is within the allowed range (1-31).
 */
export const validatePeriodCount = (count: number): Effect.Effect<void, InvalidPeriodCountError> =>
  count >= MIN_PERIODS && count <= MAX_PERIODS
    ? Effect.void
    : Effect.fail(
        new InvalidPeriodCountError({
          message: `Plan must have between ${MIN_PERIODS} and ${MAX_PERIODS} periods, got ${count}`,
          periodCount: count,
          minPeriods: MIN_PERIODS,
          maxPeriods: MAX_PERIODS,
        }),
      );

/**
 * Validate that all periods in an ordered array are contiguous:
 * each period starts exactly where the previous one ends (spec §2.4).
 */
export const validatePeriodContiguity = (periods: ReadonlyArray<PeriodDateRange>): boolean => {
  for (let i = 1; i < periods.length; i++) {
    const prev = periods[i - 1]!;
    const curr = periods[i]!;
    if (prev.endDate.getTime() !== curr.startDate.getTime()) {
      return false;
    }
  }
  return true;
};

/**
 * Validate that a single period satisfies all phase ordering invariants (spec §2.3):
 * - startDate === fastingStartDate
 * - endDate === eatingEndDate
 * - fastingStartDate < fastingEndDate
 * - fastingEndDate <= eatingStartDate
 * - eatingStartDate < eatingEndDate
 * - endDate > startDate
 */
export const validatePhaseInvariants = isValidPeriodDateRange;
