import { Effect } from 'effect';
import { PlanInvalidStateError } from '../errors';
import { type PlanStatus } from '../plan.model';
import { PlanCreationDecision, type PlanCreationInput } from '../contracts';

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
 * @param input - PlanCreationInput with userId, activePlanId, activeCycleId
 * @returns PlanCreationDecision ADT (CanCreate, BlockedByActivePlan, or BlockedByActiveCycle)
 */
export const decidePlanCreation = (input: PlanCreationInput): PlanCreationDecision => {
  const { userId, activePlanId, activeCycleId } = input;

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
  decidePlanCreation(input: PlanCreationInput): PlanCreationDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    assertPlanIsInProgress,
    decidePlanCreation,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
