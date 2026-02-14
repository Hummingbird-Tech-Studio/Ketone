import { Effect } from 'effect';
import { MIN_PERIODS, MAX_PERIODS, PeriodUpdateDecision, type PeriodWriteData } from '../plan.model';
import { calculatePeriodDates } from './period-calculation.service';
import { type PeriodUpdateDecisionInput } from '../contracts';

// ============================================================================
// FUNCTIONAL CORE — Pure period update decision logic (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection) and wrapped in the PeriodUpdateService
// Effect.Service below.
//
// Three Phases usage (in PlanService.updatePlanPeriods):
//   1. COLLECTION (Shell): Repository loads plan + periods from DB
//   2. LOGIC (Core):       decidePeriodUpdate validates input and computes
//                           ordered periods with calculated dates
//   3. PERSISTENCE (Shell): Repository persists computed periods (overlap
//                           check + delete/insert) or service maps rejection
//                           variants to domain errors
// ============================================================================

/**
 * Decide period update using the PeriodUpdateDecision contract ADT.
 *
 * Pure function that validates the input and computes the final ordered
 * period list with all date fields calculated. No I/O, no Effect.
 *
 * Validation steps:
 * 1. Validate total period count (1-31) → InvalidPeriodCount
 * 2. Check for duplicate IDs in input → DuplicatePeriodId
 * 3. Check all provided IDs belong to plan → PeriodNotInPlan
 * 4. Build ordered list: remaining existing (by original order) + new periods
 * 5. Calculate dates via calculatePeriodDates (reuse existing pure function)
 * 6. Map to PeriodWriteData[] with original IDs for existing, null for new
 * 7. Return CanUpdate with computed data
 *
 * @param input - PeriodUpdateDecisionInput with planId, planStartDate, existingPeriods, inputPeriods
 * @returns PeriodUpdateDecision ADT
 */
export const decidePeriodUpdate = (input: PeriodUpdateDecisionInput): PeriodUpdateDecision => {
  const { planId, planStartDate, existingPeriods, inputPeriods } = input;

  // Separate input into periods with ID (updates) and without ID (new)
  const periodsWithId = inputPeriods.filter((p): p is typeof p & { id: string } => p.id !== undefined);
  const periodsWithoutId = inputPeriods.filter((p) => p.id === undefined);

  // 1. Validate total period count
  const finalCount = periodsWithId.length + periodsWithoutId.length;
  if (finalCount < MIN_PERIODS || finalCount > MAX_PERIODS) {
    return PeriodUpdateDecision.InvalidPeriodCount({
      periodCount: finalCount,
      minPeriods: MIN_PERIODS,
      maxPeriods: MAX_PERIODS,
    });
  }

  // 2. Check for duplicate IDs in input
  const seenIds = new Set<string>();
  for (const period of periodsWithId) {
    if (seenIds.has(period.id)) {
      return PeriodUpdateDecision.DuplicatePeriodId({ planId, periodId: period.id });
    }
    seenIds.add(period.id);
  }

  // 3. Check all provided IDs belong to the plan
  const existingPeriodIds = new Set<string>(existingPeriods.map((p) => p.id));
  for (const period of periodsWithId) {
    if (!existingPeriodIds.has(period.id)) {
      return PeriodUpdateDecision.PeriodNotInPlan({ planId, periodId: period.id });
    }
  }

  // 4. Build ordered list: remaining existing (by original order) + new periods
  const inputPeriodIds = new Set(periodsWithId.map((p) => p.id));
  const remainingExisting = existingPeriods.filter((p) => inputPeriodIds.has(p.id)).sort((a, b) => a.order - b.order);

  const inputPeriodMap = new Map(periodsWithId.map((p) => [p.id, p]));

  // 5. Build ordered duration inputs and calculate dates
  const orderedDurationInputs = [
    ...remainingExisting.map((existing) => {
      const inputPeriod = inputPeriodMap.get(existing.id)!;
      return {
        fastingDuration: inputPeriod.fastingDuration,
        eatingWindow: inputPeriod.eatingWindow,
      };
    }),
    ...periodsWithoutId.map((p) => ({
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
    })),
  ];

  const calculatedPeriods = calculatePeriodDates(planStartDate, orderedDurationInputs);

  // 6. Map to PeriodWriteData with original IDs for existing, null for new
  const periodsToWrite: PeriodWriteData[] = calculatedPeriods.map((calc, index) => ({
    id: index < remainingExisting.length ? remainingExisting[index]!.id : null,
    order: calc.order,
    fastingDuration: calc.fastingDuration,
    eatingWindow: calc.eatingWindow,
    startDate: calc.startDate,
    endDate: calc.endDate,
    fastingStartDate: calc.fastingStartDate,
    fastingEndDate: calc.fastingEndDate,
    eatingStartDate: calc.eatingStartDate,
    eatingEndDate: calc.eatingEndDate,
  }));

  // 7. Return CanUpdate
  return PeriodUpdateDecision.CanUpdate({ planId, periodsToWrite });
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPeriodUpdateService {
  decidePeriodUpdate(input: PeriodUpdateDecisionInput): PeriodUpdateDecision;
}

export class PeriodUpdateService extends Effect.Service<PeriodUpdateService>()('PeriodUpdateService', {
  effect: Effect.succeed({
    decidePeriodUpdate,
  } satisfies IPeriodUpdateService),
  accessors: true,
}) {}
