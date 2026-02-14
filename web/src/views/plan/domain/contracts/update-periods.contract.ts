/**
 * UpdatePeriods Contract
 *
 * Use-case interface for updating a plan's period durations.
 * It represents the input data for updating a plan's period durations.
 */
import { Schema as S } from 'effect';
import { PlanId, PlanPeriodUpdate } from '../plan.model';

const UpdatePeriodsInput = S.Struct({
  planId: PlanId,
  periods: S.Array(PlanPeriodUpdate),
});
export type UpdatePeriodsInput = S.Schema.Type<typeof UpdatePeriodsInput>;
