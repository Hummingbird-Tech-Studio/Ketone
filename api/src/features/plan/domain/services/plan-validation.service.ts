import { Effect } from 'effect';
import { PlanInvalidStateError, InvalidPeriodCountError } from '../errors';
import { type PlanStatus, type PeriodDateRange, isValidPeriodDateRange, MIN_PERIODS, MAX_PERIODS } from '../plan.model';
import { PlanCreationDecision } from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure validation functions (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection, e.g., repositories) and wrapped in the
// PlanValidationService Effect.Service below.
// ============================================================================

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
 * Validate that a single period satisfies all phase ordering invariants (spec §2.3).
 */
export const validatePhaseInvariants = isValidPeriodDateRange;

/**
 * Decide plan creation using the PlanCreationDecision contract ADT.
 *
 * Checks mutual exclusivity preconditions (no active plan, no active cycle)
 * and produces a reified decision for the Three Phases pattern.
 *
 * @param userId - The user attempting to create a plan
 * @param activePlanId - ID of an existing active plan, or null
 * @param activeCycleId - ID of an existing active cycle, or null
 * @returns PlanCreationDecision ADT (CanCreate, BlockedByActivePlan, or BlockedByActiveCycle)
 */
export const decidePlanCreation = (
  userId: string,
  activePlanId: string | null,
  activeCycleId: string | null,
): PlanCreationDecision => {
  if (activePlanId) {
    return PlanCreationDecision.BlockedByActivePlan({ userId, planId: activePlanId });
  }
  if (activeCycleId) {
    return PlanCreationDecision.BlockedByActiveCycle({ userId, cycleId: activeCycleId });
  }
  return PlanCreationDecision.CanCreate();
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanValidationService {
  assertPlanIsInProgress(status: PlanStatus): Effect.Effect<void, PlanInvalidStateError>;
  validatePeriodCount(count: number): Effect.Effect<void, InvalidPeriodCountError>;
  validatePeriodContiguity(periods: ReadonlyArray<PeriodDateRange>): boolean;
  decidePlanCreation(userId: string, activePlanId: string | null, activeCycleId: string | null): PlanCreationDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    assertPlanIsInProgress,
    validatePeriodCount,
    validatePeriodContiguity,
    decidePlanCreation,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
