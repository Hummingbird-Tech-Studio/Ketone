import { Effect } from 'effect';
import { PlanCompletionDecision, type CycleCreateInput } from '../plan.model';
import { type PlanCompletionInput } from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure completion logic (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported as standalone pure functions (for consumers that don't
// use dependency injection).
//
// Three Phases usage (in PlanService.completePlan):
//   1. COLLECTION (Shell): Repository loads plan + periods from DB
//   2. LOGIC (Core):       decidePlanCompletion checks status, period
//                           completion, and builds cycle creation data
//   3. PERSISTENCE (Shell): Repository atomically completes plan + creates cycles
//
// Business rules (spec §4.5, PC-01):
//   - Plan must be InProgress to complete
//   - All periods must have elapsed (now >= eatingEndDate for each period)
//   - Each completed period produces a cycle from fasting dates
// ============================================================================

/**
 * Decide plan completion using the PlanCompletionDecision contract ADT.
 *
 * Checks status, validates all periods are complete, and builds cycle data
 * in a single pure decision for the Three Phases pattern.
 *
 * @param input - PlanCompletionInput with planId, status, periods, now, userId
 * @returns PlanCompletionDecision ADT (CanComplete, PeriodsNotFinished, or InvalidState)
 */
export const decidePlanCompletion = (input: PlanCompletionInput): PlanCompletionDecision => {
  const { planId, status, periods, now, userId } = input;

  if (status !== 'InProgress') {
    return PlanCompletionDecision.InvalidState({ planId, currentStatus: status });
  }

  if (periods.length === 0) {
    return PlanCompletionDecision.PeriodsNotFinished({ planId, completedCount: 0, totalCount: 0 });
  }

  const completedCount = periods.filter((p) => now.getTime() >= p.eatingEndDate.getTime()).length;
  if (completedCount < periods.length) {
    return PlanCompletionDecision.PeriodsNotFinished({ planId, completedCount, totalCount: periods.length });
  }

  const cyclesToCreate: CycleCreateInput[] = periods.map((p) => ({
    userId,
    startDate: p.fastingStartDate,
    endDate: p.fastingEndDate,
  }));

  return PlanCompletionDecision.CanComplete({ planId, cyclesToCreate, completedAt: now });
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanCompletionService {
  decidePlanCompletion(input: PlanCompletionInput): PlanCompletionDecision;
}

export class PlanCompletionService extends Effect.Service<PlanCompletionService>()('PlanCompletionService', {
  effect: Effect.succeed({
    decidePlanCompletion,
  } satisfies IPlanCompletionService),
  accessors: true,
}) {}
