import { Schema as S } from 'effect';
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
