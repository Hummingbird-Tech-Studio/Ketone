/**
 * CompletePlan Contract
 *
 * Use-case interface for completing an active plan.
 * No decision ADT — server validates that all periods are completed
 * before allowing plan completion.
 */
import { Schema as S } from 'effect';
import { PlanId } from '../plan.model';

export const CompletePlanInput = S.Struct({
  planId: PlanId,
});
export type CompletePlanInput = S.Schema.Type<typeof CompletePlanInput>;
