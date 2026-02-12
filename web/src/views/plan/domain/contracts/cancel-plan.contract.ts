/**
 * CancelPlan Contract
 *
 * Use-case interface for cancelling an active plan.
 * No decision ADT — cancellation is unconditional.
 * The API classifies period outcomes (completed, partial, discarded).
 */
import { Schema as S } from 'effect';
import { PlanId } from '../plan.model';

export const CancelPlanInput = S.Struct({
  planId: PlanId,
});
export type CancelPlanInput = S.Schema.Type<typeof CancelPlanInput>;
