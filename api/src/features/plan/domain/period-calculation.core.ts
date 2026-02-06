import type { PeriodDateRange } from './plan.model';

const ONE_HOUR_MS = 3_600_000;

/**
 * Pure date calculation functions for plan periods.
 * No I/O — all functions are deterministic and testable.
 */

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
export interface CalculatedPeriod extends PeriodDateRange {
  readonly order: number;
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

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
 *
 * Takes existing periods (with durations) and recomputes all dates
 * starting from the new start date while maintaining contiguity.
 */
export const recalculatePeriodDates = (
  newStartDate: Date,
  existingPeriods: ReadonlyArray<PeriodDurationInput>,
): CalculatedPeriod[] => calculatePeriodDates(newStartDate, existingPeriods);
