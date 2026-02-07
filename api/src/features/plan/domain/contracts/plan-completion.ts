import { Data, Schema as S } from 'effect';
import { type PlanStatus, PlanId, PlanStatusSchema, PeriodDatesSchema } from '../plan.model';

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

/**
 * CycleCreateInput - Data needed to create a cycle from a completed period.
 */
export const CycleCreateInput = S.Struct({
  userId: S.UUID,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
});
export type CycleCreateInput = S.Schema.Type<typeof CycleCreateInput>;

/**
 * PlanCompletionDecision - Reified decision for plan completion.
 *
 * CanComplete: All periods are completed, plan can be marked complete
 * PeriodsNotFinished: Some periods are still not completed
 * InvalidState: Plan is not in a completable state
 */
export type PlanCompletionDecision = Data.TaggedEnum<{
  CanComplete: {
    readonly planId: PlanId;
    readonly cyclesToCreate: ReadonlyArray<CycleCreateInput>;
    readonly completedAt: Date;
  };
  PeriodsNotFinished: {
    readonly planId: PlanId;
    readonly completedCount: number;
    readonly totalCount: number;
  };
  InvalidState: { readonly planId: PlanId; readonly currentStatus: PlanStatus };
}>;
export const PlanCompletionDecision = Data.taggedEnum<PlanCompletionDecision>();
