/**
 * CompletePlan Contract
 *
 * Use-case interface for completing an active plan.
 * It represents the input data for completing a plan.
 */
import { Schema as S } from 'effect';
import { PlanId } from '../plan.model';

const CompletePlanInput = S.Struct({
  planId: PlanId,
});
export type CompletePlanInput = S.Schema.Type<typeof CompletePlanInput>;
