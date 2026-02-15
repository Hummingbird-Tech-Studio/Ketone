import { Effect } from 'effect';
import { type PlanStatus, MIN_PERIODS, MAX_PERIODS } from '../plan.model';
import { type PlanCreationInput, PlanCreationDecision } from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure validation functions (no I/O, no Effect error signaling, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection, e.g., repositories).
// ============================================================================

/**
 * BR-01: Check whether a plan is in InProgress state.
 * All mutating operations (update metadata, update periods, cancel, complete)
 * require this precondition (spec §4.2, §4.3, §4.4, §4.5).
 *
 * Returns a boolean predicate — callers (Shell) are responsible for
 * constructing PlanInvalidStateError when the check fails.
 */
export const isPlanInProgress = (status: PlanStatus): boolean => status === 'InProgress';

/**
 * Decide plan creation using the PlanCreationDecision contract ADT.
 *
 * Checks period count, mutual exclusivity preconditions (no active plan,
 * no active cycle) and produces a reified decision for the Three Phases pattern.
 *
 * @param input - PlanCreationInput with userId, activePlanId, activeCycleId, periodCount
 * @returns PlanCreationDecision ADT (CanCreate, BlockedByActivePlan, BlockedByActiveCycle, or InvalidPeriodCount)
 */
export const decidePlanCreation = (input: PlanCreationInput): PlanCreationDecision => {
  const { userId, activePlanId, activeCycleId, periodCount } = input;

  if (periodCount < MIN_PERIODS || periodCount > MAX_PERIODS) {
    return PlanCreationDecision.InvalidPeriodCount({
      periodCount,
      minPeriods: MIN_PERIODS,
      maxPeriods: MAX_PERIODS,
    });
  }

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
  isPlanInProgress(status: PlanStatus): boolean;
  decidePlanCreation(input: PlanCreationInput): PlanCreationDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    isPlanInProgress,
    decidePlanCreation,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
