import { Effect } from 'effect';
import { type PeriodDateRange, type CancellationResult, CancellationResult as CR } from '../plan.model';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FastingDateRange {
  readonly fastingStartDate: Date;
  readonly fastingEndDate: Date;
}

export interface CancellationDecision {
  readonly completedPeriodsFastingDates: FastingDateRange[];
  readonly inProgressPeriodFastingDates: FastingDateRange | null;
}

// ============================================================================
// FUNCTIONAL CORE — Pure cancellation logic (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection) and wrapped in the PlanCancellationService
// Effect.Service below.
//
// Three Phases usage (in PlanService.cancelPlan):
//   1. COLLECTION (Shell): Repository loads plan + periods from DB
//   2. LOGIC (Core):       decideCancellation classifies periods and builds
//                           cycle data (CancellationResult per period)
//   3. PERSISTENCE (Shell): Repository atomically cancels plan + creates cycles
//
// Business rules (spec §4.4, BR-03):
//   - CompletedPeriod:                 cycle.endDate = fastingEndDate
//   - CompletedFastingInEatingPhase:   cycle.endDate = fastingEndDate
//   - PartialFastingPeriod:            cycle.endDate = cancellationTime
//   - DiscardedPeriod:                 no cycle created
// ============================================================================

/**
 * Determine the outcome for a single period based on current time.
 *
 * Outcomes:
 * - CompletedPeriod: Period was fully completed (fasting + eating)
 * - CompletedFastingInEatingPhase: Period is in eating phase (fasting completed)
 * - PartialFastingPeriod: Period is in fasting phase (partial fast)
 * - DiscardedPeriod: Period hasn't started yet
 */
export const determinePeriodOutcome = (period: PeriodDateRange, currentTime: Date): CancellationResult => {
  const currentTimeMs = currentTime.getTime();
  const fastingStartMs = period.fastingStartDate.getTime();
  const fastingEndMs = period.fastingEndDate.getTime();
  const eatingEndMs = period.eatingEndDate.getTime();

  if (currentTimeMs < fastingStartMs) {
    return CR.DiscardedPeriod();
  }

  if (currentTimeMs < fastingEndMs) {
    return CR.PartialFastingPeriod({
      fastingStartDate: period.fastingStartDate,
      fastingEndDate: currentTime,
      originalFastingEndDate: period.fastingEndDate,
    });
  }

  if (currentTimeMs < eatingEndMs) {
    return CR.CompletedFastingInEatingPhase({
      fastingStartDate: period.fastingStartDate,
      fastingEndDate: period.fastingEndDate,
    });
  }

  return CR.CompletedPeriod({
    fastingStartDate: period.fastingStartDate,
    fastingEndDate: period.fastingEndDate,
  });
};

/**
 * Process cancellation for all periods in a plan.
 */
export const processCancellation = (
  periods: ReadonlyArray<PeriodDateRange>,
  currentTime: Date,
): ReadonlyArray<CancellationResult> => periods.map((period) => determinePeriodOutcome(period, currentTime));

/**
 * Decide which cycles to preserve when cancelling a plan.
 *
 * This is the pure decision function for the Three Phases pattern:
 * - Collection: caller fetches plan + periods from DB
 * - Logic: this function classifies periods and builds cycle data (pure)
 * - Persistence: caller passes result to repository for atomic cancellation
 *
 * Business rules applied:
 * - Completed periods -> full fasting cycle
 * - InProgress periods (fasting or eating) -> fasting cycle
 * - Scheduled periods -> skipped
 */
export const decideCancellation = (
  periods: ReadonlyArray<PeriodDateRange>,
  now: Date,
): CancellationDecision => {
  const results = processCancellation(periods, now);

  const completedPeriodsFastingDates: FastingDateRange[] = [];
  let inProgressPeriodFastingDates: FastingDateRange | null = null;

  for (const result of results) {
    switch (result._tag) {
      case 'CompletedPeriod':
        completedPeriodsFastingDates.push({
          fastingStartDate: result.fastingStartDate,
          fastingEndDate: result.fastingEndDate,
        });
        break;
      case 'CompletedFastingInEatingPhase':
        inProgressPeriodFastingDates = {
          fastingStartDate: result.fastingStartDate,
          fastingEndDate: result.fastingEndDate,
        };
        break;
      case 'PartialFastingPeriod':
        inProgressPeriodFastingDates = {
          fastingStartDate: result.fastingStartDate,
          fastingEndDate: result.fastingEndDate,
        };
        break;
      case 'DiscardedPeriod':
        break;
    }
  }

  return { completedPeriodsFastingDates, inProgressPeriodFastingDates };
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanCancellationService {
  processCancellation(periods: ReadonlyArray<PeriodDateRange>, currentTime: Date): ReadonlyArray<CancellationResult>;
  determinePeriodOutcome(period: PeriodDateRange, currentTime: Date): CancellationResult;
}

export class PlanCancellationService extends Effect.Service<PlanCancellationService>()('PlanCancellationService', {
  effect: Effect.succeed({
    processCancellation,
    determinePeriodOutcome,
  } satisfies IPlanCancellationService),
  accessors: true,
}) {}
