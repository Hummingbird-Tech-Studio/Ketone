import { Data } from 'effect';
import type { PeriodDates } from '../plan.model';

/**
 * PeriodUpdateDecisionInput - Data required for the period update decision.
 *
 * Collected in the Shell phase (service + repository) and passed to
 * the pure decidePeriodUpdate function in the Logic phase.
 */
export interface PeriodUpdateDecisionInput {
  readonly planId: string;
  readonly planStartDate: Date;
  readonly existingPeriods: ReadonlyArray<{ readonly id: string; readonly order: number }>;
  readonly inputPeriods: ReadonlyArray<{
    readonly id?: string;
    readonly fastingDuration: number;
    readonly eatingWindow: number;
  }>;
}

/**
 * PeriodWriteData - Computed period data ready for persistence.
 *
 * Contains all calculated dates plus the original ID (for existing periods)
 * or null (for new periods).
 */
export interface PeriodWriteData extends PeriodDates {
  readonly id: string | null;
  readonly order: number;
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

/**
 * PeriodUpdateDecision - Reified decision for period update.
 *
 * CanUpdate: All validations passed, periods are computed and ready to persist
 * InvalidPeriodCount: Final period count is outside 1-31 range
 * DuplicatePeriodId: Input contains duplicate period IDs
 * PeriodNotInPlan: A provided period ID does not belong to the plan
 */
export type PeriodUpdateDecision = Data.TaggedEnum<{
  CanUpdate: { readonly planId: string; readonly periodsToWrite: ReadonlyArray<PeriodWriteData> };
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
  DuplicatePeriodId: { readonly planId: string; readonly periodId: string };
  PeriodNotInPlan: { readonly planId: string; readonly periodId: string };
}>;
export const PeriodUpdateDecision = Data.taggedEnum<PeriodUpdateDecision>();
export const { $is: isPeriodUpdateDecision, $match: matchPeriodUpdateDecision } = PeriodUpdateDecision;
