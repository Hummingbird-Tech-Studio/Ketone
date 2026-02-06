import { Effect } from 'effect';
import { PlanInvalidStateError } from '../errors';
import { type PlanStatus } from '../plan.model';
import { PlanCreationDecision } from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure validation functions (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection, e.g., repositories).
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
