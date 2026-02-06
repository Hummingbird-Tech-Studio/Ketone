import { Effect } from 'effect';
import { PeriodPhase, PlanProgress, type PeriodDates } from '../plan.model';

const ONE_HOUR_MS = 3_600_000;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Input for period date calculation: durations only, no dates.
 */
export interface PeriodDurationInput {
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

/**
 * Calculated period data including order, durations, and all date fields.
 */
export interface CalculatedPeriod extends PeriodDates {
  readonly order: number;
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

// ============================================================================
// FUNCTIONAL CORE — Pure calculation functions (no I/O, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection, e.g., repositories) and wrapped in the
// PeriodCalculationService Effect.Service below.
//
// Three Phases usage (in PlanService):
//   1. COLLECTION (Shell): Repository loads plan + periods from DB
//   2. LOGIC (Core):       calculatePeriodDates / recalculatePeriodDates
//   3. PERSISTENCE (Shell): Repository persists calculated periods to DB
// ============================================================================

/**
 * Calculate period dates from a start date and an ordered array of duration inputs.
 * Periods are consecutive — each starts exactly where the previous one ends (spec §2.4).
 *
 * Each period's phase timestamps are computed as:
 * - fastingStartDate = periodStart
 * - fastingEndDate = periodStart + fastingDuration
 * - eatingStartDate = fastingEndDate
 * - eatingEndDate = eatingStartDate + eatingWindow
 * - startDate = fastingStartDate
 * - endDate = eatingEndDate
 */
export const calculatePeriodDates = (
  startDate: Date,
  periods: ReadonlyArray<PeriodDurationInput>,
): CalculatedPeriod[] => {
  let currentDate = new Date(startDate);

  return periods.map((period, index) => {
    const periodStart = new Date(currentDate);
    const fastingDurationMs = period.fastingDuration * ONE_HOUR_MS;
    const eatingWindowMs = period.eatingWindow * ONE_HOUR_MS;

    const fastingStartDate = new Date(periodStart);
    const fastingEndDate = new Date(periodStart.getTime() + fastingDurationMs);
    const eatingStartDate = new Date(fastingEndDate);
    const eatingEndDate = new Date(eatingStartDate.getTime() + eatingWindowMs);

    currentDate = eatingEndDate;

    return {
      order: index + 1,
      fastingDuration: period.fastingDuration,
      eatingWindow: period.eatingWindow,
      startDate: periodStart,
      endDate: eatingEndDate,
      fastingStartDate,
      fastingEndDate,
      eatingStartDate,
      eatingEndDate,
    };
  });
};

/**
 * Recalculate all period dates from a new start date, preserving existing durations.
 * Used when the plan's startDate is changed (spec §4.2).
 */
export const recalculatePeriodDates = (
  newStartDate: Date,
  existingPeriods: ReadonlyArray<PeriodDurationInput>,
): CalculatedPeriod[] => calculatePeriodDates(newStartDate, existingPeriods);

/**
 * Assess the current phase of a period relative to the given time.
 */
export const assessPeriodPhase = (period: PeriodDates, now: Date): PeriodPhase => {
  const nowMs = now.getTime();
  const fastingStartMs = period.fastingStartDate.getTime();
  const fastingEndMs = period.fastingEndDate.getTime();
  const eatingEndMs = period.eatingEndDate.getTime();

  if (nowMs < fastingStartMs) {
    return PeriodPhase.Scheduled({ startsInMs: fastingStartMs - nowMs });
  }

  if (nowMs < fastingEndMs) {
    const elapsedMs = nowMs - fastingStartMs;
    const remainingMs = fastingEndMs - nowMs;
    const totalFasting = fastingEndMs - fastingStartMs;
    const percentage = Math.min(100, Math.max(0, (elapsedMs / totalFasting) * 100));
    return PeriodPhase.Fasting({ elapsedMs, remainingMs, percentage });
  }

  if (nowMs < eatingEndMs) {
    const fastingCompletedMs = fastingEndMs - fastingStartMs;
    const eatingElapsedMs = nowMs - fastingEndMs;
    const eatingRemainingMs = eatingEndMs - nowMs;
    return PeriodPhase.Eating({ fastingCompletedMs, eatingElapsedMs, eatingRemainingMs });
  }

  const fastingDurationMs = fastingEndMs - fastingStartMs;
  const eatingDurationMs = eatingEndMs - fastingEndMs;
  return PeriodPhase.Completed({ fastingDurationMs, eatingDurationMs });
};

/**
 * Assess overall plan progress relative to the given time.
 */
export const assessPlanProgress = (periods: ReadonlyArray<PeriodDates>, now: Date): PlanProgress => {
  if (periods.length === 0) {
    return PlanProgress.AllPeriodsCompleted({ totalPeriods: 0, totalFastingTimeMs: 0 });
  }

  const nowMs = now.getTime();
  const firstPeriod = periods[0]!;
  const firstPeriodStartMs = firstPeriod.fastingStartDate.getTime();

  if (nowMs < firstPeriodStartMs) {
    return PlanProgress.NotStarted({
      startsInMs: firstPeriodStartMs - nowMs,
      totalPeriods: periods.length,
    });
  }

  let completedPeriods = 0;
  let currentPeriodIndex = -1;
  let totalFastingMs = 0;

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]!;
    const periodEndMs = period.eatingEndDate.getTime();

    if (nowMs >= periodEndMs) {
      completedPeriods++;
      totalFastingMs += period.fastingEndDate.getTime() - period.fastingStartDate.getTime();
    } else if (currentPeriodIndex === -1) {
      currentPeriodIndex = i;
    }
  }

  if (completedPeriods === periods.length) {
    return PlanProgress.AllPeriodsCompleted({
      totalPeriods: periods.length,
      totalFastingTimeMs: totalFastingMs,
    });
  }

  const currentPeriod = periods[currentPeriodIndex]!;
  const currentPeriodPhase = assessPeriodPhase(currentPeriod, now);

  return PlanProgress.InProgress({
    currentPeriodIndex,
    totalPeriods: periods.length,
    completedPeriods,
    currentPeriodPhase,
  });
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPeriodCalculationService {
  calculatePeriodDates(startDate: Date, periods: ReadonlyArray<PeriodDurationInput>): CalculatedPeriod[];
  recalculatePeriodDates(newStartDate: Date, existingPeriods: ReadonlyArray<PeriodDurationInput>): CalculatedPeriod[];
  assessPeriodPhase(period: PeriodDates, now: Date): PeriodPhase;
  assessPlanProgress(periods: ReadonlyArray<PeriodDates>, now: Date): PlanProgress;
}

export class PeriodCalculationService extends Effect.Service<PeriodCalculationService>()('PeriodCalculationService', {
  effect: Effect.succeed({
    calculatePeriodDates,
    recalculatePeriodDates,
    assessPeriodPhase,
    assessPlanProgress,
  } satisfies IPeriodCalculationService),
  accessors: true,
}) {}
