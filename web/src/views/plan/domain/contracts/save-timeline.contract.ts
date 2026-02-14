/**
 * SaveTimeline Contract
 *
 * Use-case interface for saving timeline changes in the plan edit flow.
 * It represents the input data for saving timeline changes in a plan editing workflow.
 */
import { Schema as S } from 'effect';
import { PlanDetail, PlanId, PlanPeriodUpdate } from '../plan.model';

const SaveTimelineInput = S.Struct({
  planId: PlanId,
  originalPlan: S.instanceOf(PlanDetail),
  currentStartDate: S.optional(S.DateFromSelf),
  currentPeriods: S.optional(S.Array(PlanPeriodUpdate)),
});
export type SaveTimelineInput = S.Schema.Type<typeof SaveTimelineInput>;
