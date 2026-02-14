import { Schema as S } from 'effect';
import { PlanId, PlanStatusSchema, PeriodDatesSchema } from '../plan.model';

/**
 * PlanCancellationInput - Data required for the plan cancellation decision.
 */
export const PlanCancellationInput = S.Struct({
  planId: PlanId,
  status: PlanStatusSchema,
  periods: S.Array(PeriodDatesSchema),
  now: S.DateFromSelf,
});
export type PlanCancellationInput = S.Schema.Type<typeof PlanCancellationInput>;
