/**
 * CancelPlan Contract
 *
 * Use-case interface for cancelling an active plan.
 * It represents the data required to cancel a fasting plan.
 */
import { Schema as S } from 'effect';
import { PlanId } from '../plan.model';

const CancelPlanInput = S.Struct({
  planId: PlanId,
});
export type CancelPlanInput = S.Schema.Type<typeof CancelPlanInput>;
