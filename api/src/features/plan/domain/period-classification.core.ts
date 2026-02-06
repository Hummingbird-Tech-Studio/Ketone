import { Match } from 'effect';
import {
  type PeriodDateRange,
  type PeriodClassification,
  type CycleConversionResult,
  Completed,
  InProgress,
  Scheduled,
  CycleConversionResult as CycleConversion,
} from './plan.model';

/**
 * Pure period classification and cycle conversion functions.
 * No I/O — all functions are deterministic and testable.
 */

/**
 * Classify a single period relative to the current time (spec §4.4).
 *
 * - Completed: now >= period.endDate (all phases elapsed)
 * - InProgress: now >= period.startDate && now < period.endDate (currently executing)
 * - Scheduled: now < period.startDate (not yet started)
 */
export const classifyPeriod = (period: PeriodDateRange, now: Date): PeriodClassification => {
  if (now >= period.endDate) {
    return Completed({ period });
  }
  if (now >= period.startDate) {
    return InProgress({ period, now });
  }
  return Scheduled({ period });
};

/**
 * Classify all periods in a plan relative to the current time.
 * Returns classifications in the same order as input.
 */
export const classifyPeriods = (
  periods: ReadonlyArray<PeriodDateRange>,
  now: Date,
): PeriodClassification[] => periods.map((period) => classifyPeriod(period, now));

/**
 * Convert a PeriodClassification to a CycleConversionResult (spec §4.4, BR-03).
 *
 * Conversion rules:
 * - Completed: cycle created with full fasting phase
 *   → startDate = fastingStartDate, endDate = fastingEndDate
 *
 * - InProgress: cycle created with truncated fasting if still fasting
 *   → startDate = fastingStartDate, endDate = min(fastingEndDate, now)
 *   If user is in eating window (now >= fastingEndDate), full fasting is recorded.
 *   If still fasting (now < fastingEndDate), fasting is truncated at now.
 *
 * - Scheduled: no cycle created (period not started)
 */
export const buildCycleFromClassification = (
  classification: PeriodClassification,
): CycleConversionResult =>
  Match.value(classification).pipe(
    Match.tag('Completed', ({ period }) =>
      CycleConversion.Created({
        startDate: period.fastingStartDate,
        endDate: period.fastingEndDate,
      }),
    ),
    Match.tag('InProgress', ({ period, now }) =>
      CycleConversion.Created({
        startDate: period.fastingStartDate,
        // BR-03: min(fastingEndDate, now)
        // If now < fastingEndDate (still fasting) → truncate at now
        // If now >= fastingEndDate (eating window) → full fasting recorded
        endDate: now < period.fastingEndDate ? now : period.fastingEndDate,
      }),
    ),
    Match.tag('Scheduled', ({ period: _period }) =>
      CycleConversion.Skipped({
        reason: 'Period not yet started',
      }),
    ),
    Match.exhaustive,
  );

/**
 * Classify all periods and convert each to a CycleConversionResult.
 * Convenience function that combines classifyPeriods + buildCycleFromClassification.
 */
export const buildCyclesFromPeriods = (
  periods: ReadonlyArray<PeriodDateRange>,
  now: Date,
): CycleConversionResult[] =>
  classifyPeriods(periods, now).map(buildCycleFromClassification);
