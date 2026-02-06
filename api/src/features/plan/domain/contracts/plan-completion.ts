import { Data } from 'effect';

/**
 * CycleCreateInput - Data needed to create a cycle from a completed period.
 */
export interface CycleCreateInput {
  readonly userId: string;
  readonly startDate: Date;
  readonly endDate: Date;
}

/**
 * PlanCompletionDecision - Reified decision for plan completion.
 *
 * CanComplete: All periods are completed, plan can be marked complete
 * PeriodsNotFinished: Some periods are still not completed
 * InvalidState: Plan is not in a completable state
 */
export type PlanCompletionDecision = Data.TaggedEnum<{
  CanComplete: {
    readonly planId: string;
    readonly cyclesToCreate: ReadonlyArray<CycleCreateInput>;
    readonly completedAt: Date;
  };
  PeriodsNotFinished: {
    readonly planId: string;
    readonly completedCount: number;
    readonly totalCount: number;
  };
  InvalidState: { readonly planId: string; readonly currentStatus: string };
}>;
export const PlanCompletionDecision = Data.taggedEnum<PlanCompletionDecision>();
