import type { PeriodDateRange } from './plan.model';
import { classifyPeriods, buildCycleFromClassification } from './period-classification.core';

/**
 * Three Phases (Functional Core Flow) for plan operations.
 *
 * Pattern: Collection → Logic → Persistence
 * These pure functions represent the "Logic" phase — no I/O, fully testable.
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FastingDateRange {
  readonly fastingStartDate: Date;
  readonly fastingEndDate: Date;
}

/**
 * Pure decision result for plan cancellation.
 * Separates completed and in-progress period fasting dates for cycle preservation.
 */
export interface CancellationDecision {
  readonly completedPeriodsFastingDates: FastingDateRange[];
  readonly inProgressPeriodFastingDates: FastingDateRange | null;
}

// ─── Pure Decision Functions ────────────────────────────────────────────────────

/**
 * Decide which cycles to preserve when cancelling a plan.
 *
 * Three Phases:
 * 1. Collection: caller fetches plan + periods from DB
 * 2. Logic: this function classifies periods and builds cycle data (pure)
 * 3. Persistence: caller passes result to repository for atomic cancellation
 *
 * Business rules applied:
 * - Completed periods → full fasting cycle (startDate = fastingStartDate, endDate = fastingEndDate)
 * - InProgress periods → truncated fasting cycle (BR-03: endDate = min(fastingEndDate, now))
 * - Scheduled periods → skipped (no cycle created)
 */
export const decideCancellation = (
  periods: ReadonlyArray<PeriodDateRange>,
  now: Date,
): CancellationDecision => {
  const classifications = classifyPeriods(periods, now);
  const conversionResults = classifications.map(buildCycleFromClassification);

  const completedPeriodsFastingDates: FastingDateRange[] = [];
  let inProgressPeriodFastingDates: FastingDateRange | null = null;

  for (let i = 0; i < classifications.length; i++) {
    const classification = classifications[i]!;
    const result = conversionResults[i]!;

    if (result._tag === 'Created') {
      if (classification._tag === 'Completed') {
        completedPeriodsFastingDates.push({
          fastingStartDate: result.startDate,
          fastingEndDate: result.endDate,
        });
      } else if (classification._tag === 'InProgress') {
        inProgressPeriodFastingDates = {
          fastingStartDate: result.startDate,
          fastingEndDate: result.endDate,
        };
      }
    }
  }

  return { completedPeriodsFastingDates, inProgressPeriodFastingDates };
};
