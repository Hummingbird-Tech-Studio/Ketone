/**
 * SaveTimeline Contract
 *
 * Use-case interface for saving timeline changes in the plan edit flow.
 * Input: what the decision function receives
 * Decision: what it produces (NoChanges, OnlyStartDate, OnlyPeriods, StartDateAndPeriods)
 */
import { Data, Schema as S } from 'effect';
import { PlanDetail, PlanId, PlanPeriodUpdate } from '../plan.model';

const SaveTimelineInput = S.Struct({
  planId: PlanId,
  originalPlan: S.instanceOf(PlanDetail),
  currentStartDate: S.optional(S.DateFromSelf),
  currentPeriods: S.optional(S.Array(PlanPeriodUpdate)),
});
export type SaveTimelineInput = S.Schema.Type<typeof SaveTimelineInput>;

/**
 * SaveTimelineDecision — Reified decision for the plan edit save flow.
 *
 * Determines what changed in the timeline and what API calls are needed:
 * - NoChanges: nothing to save, skip
 * - OnlyStartDate: only start date changed → update metadata
 * - OnlyPeriods: only period durations changed → update periods
 * - StartDateAndPeriods: both changed → update metadata then periods (sequential)
 */
export type SaveTimelineDecision = Data.TaggedEnum<{
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  NoChanges: {};
  OnlyStartDate: { readonly startDate: Date };
  OnlyPeriods: { readonly periods: ReadonlyArray<PlanPeriodUpdate> };
  StartDateAndPeriods: { readonly startDate: Date; readonly periods: ReadonlyArray<PlanPeriodUpdate> };
}>;

export const SaveTimelineDecision = Data.taggedEnum<SaveTimelineDecision>();
export const { $match: matchSaveTimelineDecision } = SaveTimelineDecision;
