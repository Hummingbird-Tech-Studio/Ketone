import { Data, Schema as S } from 'effect';
import { PlanId, PeriodId, PeriodOrderSchema } from '../plan.model';

/**
 * PeriodUpdateDecisionInput - Data required for the period update decision.
 *
 * Collected in the Shell phase (service + repository) and passed to
 * the pure decidePeriodUpdate function in the Logic phase.
 */
export const PeriodUpdateDecisionInput = S.Struct({
  planId: PlanId,
  planStartDate: S.DateFromSelf,
  existingPeriods: S.Array(S.Struct({ id: PeriodId, order: PeriodOrderSchema })),
  inputPeriods: S.Array(
    S.Struct({
      id: S.optional(S.UUID),
      fastingDuration: S.Number,
      eatingWindow: S.Number,
    }),
  ),
});
export type PeriodUpdateDecisionInput = S.Schema.Type<typeof PeriodUpdateDecisionInput>;

/**
 * PeriodWriteData - Computed period data ready for persistence.
 *
 * Contains all calculated dates plus the original ID (for existing periods)
 * or null (for new periods).
 */
export const PeriodWriteData = S.Struct({
  id: S.NullOr(S.String),
  order: S.Number,
  fastingDuration: S.Number,
  eatingWindow: S.Number,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  fastingStartDate: S.DateFromSelf,
  fastingEndDate: S.DateFromSelf,
  eatingStartDate: S.DateFromSelf,
  eatingEndDate: S.DateFromSelf,
});
export type PeriodWriteData = S.Schema.Type<typeof PeriodWriteData>;

/**
 * PeriodUpdateDecision - Reified decision for period update.
 *
 * CanUpdate: All validations passed, periods are computed and ready to persist
 * InvalidPeriodCount: Final period count is outside 1-31 range
 * DuplicatePeriodId: Input contains duplicate period IDs
 * PeriodNotInPlan: A provided period ID does not belong to the plan
 */
export type PeriodUpdateDecision = Data.TaggedEnum<{
  CanUpdate: { readonly planId: PlanId; readonly periodsToWrite: ReadonlyArray<PeriodWriteData> };
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
  DuplicatePeriodId: { readonly planId: PlanId; readonly periodId: string };
  PeriodNotInPlan: { readonly planId: PlanId; readonly periodId: string };
}>;
export const PeriodUpdateDecision = Data.taggedEnum<PeriodUpdateDecision>();
