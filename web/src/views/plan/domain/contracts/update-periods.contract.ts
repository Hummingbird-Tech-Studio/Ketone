/**
 * UpdatePeriods Contract
 *
 * Use-case interface for updating a plan's period durations.
 * No decision ADT — server validates mismatch and overlap.
 */
import { Schema as S } from 'effect';
import { PlanId, PlanPeriodUpdate } from '../plan.model';

export const UpdatePeriodsInput = S.Struct({
  planId: PlanId,
  periods: S.Array(PlanPeriodUpdate),
});
export type UpdatePeriodsInput = S.Schema.Type<typeof UpdatePeriodsInput>;
