/**
 * SaveTimeline Contract
 *
 * Use-case interface for saving timeline changes in the plan edit flow.
 * Uses SaveTimelineDecision ADT to determine what changed:
 *   - NoChanges: skip save
 *   - OnlyStartDate: update metadata only
 *   - OnlyPeriods: update periods only
 *   - StartDateAndPeriods: update metadata then periods (sequential)
 */
import { Schema as S } from 'effect';
import { PlanDetail, PlanId, PlanPeriodUpdate } from '../plan.model';

export const SaveTimelineInput = S.Struct({
  planId: PlanId,
  originalPlan: S.instanceOf(PlanDetail),
  currentStartDate: S.optional(S.DateFromSelf),
  currentPeriods: S.optional(S.Array(PlanPeriodUpdate)),
});
export type SaveTimelineInput = S.Schema.Type<typeof SaveTimelineInput>;
