import { Schema as S } from 'effect';
import { PlanId, PlanStatusSchema, PeriodDatesSchema } from '../plan.model';

/**
 * PlanCompletionInput - Data required for the plan completion decision.
 */
export const PlanCompletionInput = S.Struct({
  planId: PlanId,
  status: PlanStatusSchema,
  periods: S.Array(PeriodDatesSchema),
  now: S.DateFromSelf,
  userId: S.UUID,
});
export type PlanCompletionInput = S.Schema.Type<typeof PlanCompletionInput>;
