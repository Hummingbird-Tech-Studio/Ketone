/**
 * Plan Period Calculation Service
 *
 * FUNCTIONAL CORE — Pure date calculation functions (no I/O, no Effect error signaling, deterministic)
 *
 * These functions are the "Core" in Functional Core / Imperative Shell.
 * They are exported both as standalone functions (for consumers that don't
 * use dependency injection) and wrapped in the PlanPeriodCalculationService
 * Effect.Service below.
 *
 * Three Phases usage (in PlanApplicationService.createPlan):
 *   1. COLLECTION (Shell — Gateway): —
 *   2. LOGIC (Core):                 calculatePeriodDates computes dates from durations
 *   3. PERSISTENCE (Shell — Gateway): Send payload with calculated dates to API
 *
 * Three Phases usage (in composable — start date change):
 *   1. COLLECTION: Actor context has current periods
 *   2. LOGIC (Core): shiftPeriodDates recomputes dates from new start
 *   3. PERSISTENCE: Composable updates local state (no API call yet)
 */
import { Effect } from 'effect';
import type { EatingWindow, FastingDuration, PeriodOrder } from '../plan.model';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for a single period's duration configuration.
 */
export interface PeriodDurationInput {
  readonly fastingDuration: FastingDuration;
  readonly eatingWindow: EatingWindow;
}

/**
 * Calculated period with all date phases resolved.
 */
export interface CalculatedPeriod {
  readonly order: PeriodOrder;
  readonly fastingDuration: FastingDuration;
  readonly eatingWindow: EatingWindow;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly fastingStartDate: Date;
  readonly fastingEndDate: Date;
  readonly eatingStartDate: Date;
  readonly eatingEndDate: Date;
}

// ============================================================================
// Standalone Pure Functions
// ============================================================================

const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;

/**
 * Calculate all period dates from a start date and duration configurations.
 * Periods are contiguous: each starts exactly when the previous ends.
 *
 * For each period:
 *   startDate = fastingStartDate
 *   fastingEndDate = fastingStartDate + fastingDuration
 *   eatingStartDate = fastingEndDate
 *   eatingEndDate = eatingStartDate + eatingWindow
 *   endDate = eatingEndDate
 */
export const calculatePeriodDates = (
  startDate: Date,
  periods: ReadonlyArray<PeriodDurationInput>,
): ReadonlyArray<CalculatedPeriod> => {
  let currentStart = startDate.getTime();

  return periods.map((p, i) => {
    const fastingStartDate = new Date(currentStart);
    const fastingEndDate = new Date(currentStart + hoursToMs(p.fastingDuration));
    const eatingStartDate = fastingEndDate;
    const eatingEndDate = new Date(fastingEndDate.getTime() + hoursToMs(p.eatingWindow));

    const result: CalculatedPeriod = {
      order: (i + 1) as PeriodOrder,
      fastingDuration: p.fastingDuration,
      eatingWindow: p.eatingWindow,
      startDate: fastingStartDate,
      endDate: eatingEndDate,
      fastingStartDate,
      fastingEndDate,
      eatingStartDate,
      eatingEndDate,
    };

    currentStart = eatingEndDate.getTime();

    return result;
  });
};

/**
 * Recompute all period dates when the start date changes.
 * Preserves existing durations, shifts all dates forward/backward.
 */
export const shiftPeriodDates = (
  periods: ReadonlyArray<PeriodDurationInput>,
  newStartDate: Date,
): ReadonlyArray<CalculatedPeriod> => calculatePeriodDates(newStartDate, periods);

// ============================================================================
// Period Config Operations — for Timeline component period management
//
// These functions compute contiguous scheduling for period configs.
// They return configs WITHOUT IDs — the composable (shell) assigns IDs.
// ============================================================================

/**
 * Input shape for period config operations (startTime + durations, no ID).
 */
export interface PeriodConfigInput {
  readonly startTime: Date;
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

/**
 * Create contiguous period configs from uniform duration params.
 * Periods are contiguous: each starts exactly when the previous ends.
 */
export const createContiguousPeriods = (
  count: number,
  firstStartTime: Date,
  fastingDuration: number,
  eatingWindow: number,
): ReadonlyArray<PeriodConfigInput> => {
  const configs: PeriodConfigInput[] = [];
  let currentStartMs = firstStartTime.getTime();
  const periodDurationMs = hoursToMs(fastingDuration + eatingWindow);

  for (let i = 0; i < count; i++) {
    configs.push({
      startTime: new Date(currentStartMs),
      fastingDuration,
      eatingWindow,
    });
    currentStartMs += periodDurationMs;
  }

  return configs;
};

/**
 * Compute the next contiguous period based on the last period.
 * Preserves the last period's durations.
 */
export const computeNextContiguousPeriod = (lastPeriod: PeriodConfigInput): PeriodConfigInput => {
  const periodDurationMs = hoursToMs(lastPeriod.fastingDuration + lastPeriod.eatingWindow);
  return {
    startTime: new Date(lastPeriod.startTime.getTime() + periodDurationMs),
    fastingDuration: lastPeriod.fastingDuration,
    eatingWindow: lastPeriod.eatingWindow,
  };
};

/**
 * Shift all period start times by a time delta (ms).
 * Preserves durations and other fields.
 */
export const shiftPeriodStartTimes = (
  configs: ReadonlyArray<PeriodConfigInput>,
  deltaMs: number,
): ReadonlyArray<PeriodConfigInput> =>
  configs.map((config) => ({
    ...config,
    startTime: new Date(config.startTime.getTime() + deltaMs),
  }));

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanPeriodCalculationService {
  calculatePeriodDates(
    startDate: Date,
    periods: ReadonlyArray<PeriodDurationInput>,
  ): ReadonlyArray<CalculatedPeriod>;
  shiftPeriodDates(
    periods: ReadonlyArray<PeriodDurationInput>,
    newStartDate: Date,
  ): ReadonlyArray<CalculatedPeriod>;
  createContiguousPeriods(
    count: number,
    firstStartTime: Date,
    fastingDuration: number,
    eatingWindow: number,
  ): ReadonlyArray<PeriodConfigInput>;
  computeNextContiguousPeriod(lastPeriod: PeriodConfigInput): PeriodConfigInput;
  shiftPeriodStartTimes(
    configs: ReadonlyArray<PeriodConfigInput>,
    deltaMs: number,
  ): ReadonlyArray<PeriodConfigInput>;
}

export class PlanPeriodCalculationService extends Effect.Service<PlanPeriodCalculationService>()(
  'PlanPeriodCalculationService',
  {
    effect: Effect.succeed({
      calculatePeriodDates,
      shiftPeriodDates,
      createContiguousPeriods,
      computeNextContiguousPeriod,
      shiftPeriodStartTimes,
    } satisfies IPlanPeriodCalculationService),
    accessors: true,
  },
) {}
