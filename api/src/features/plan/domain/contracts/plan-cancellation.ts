import { Data } from 'effect';
import type { CancellationResult, PeriodDates } from '../plan.model';
import type { FastingDateRange } from '../services';

/**
 * PlanCancellationInput - Data required for the plan cancellation decision.
 */
export interface PlanCancellationInput {
  readonly planId: string;
  readonly status: string;
  readonly periods: ReadonlyArray<PeriodDates>;
  readonly now: Date;
}

/**
 * PlanCancellationDecision - Reified decision for plan cancellation.
 *
 * Cancel: Plan can be cancelled, with per-period outcomes and cycle data to create
 * InvalidState: Plan is not in a cancellable state
 */
export type PlanCancellationDecision = Data.TaggedEnum<{
  Cancel: {
    readonly planId: string;
    readonly results: ReadonlyArray<CancellationResult>;
    readonly completedPeriodsFastingDates: ReadonlyArray<FastingDateRange>;
    readonly inProgressPeriodFastingDates: FastingDateRange | null;
    readonly cancelledAt: Date;
  };
  InvalidState: { readonly planId: string; readonly currentStatus: string };
}>;
export const PlanCancellationDecision = Data.taggedEnum<PlanCancellationDecision>();
export const { $is: isPlanCancellationDecision, $match: matchPlanCancellationDecision } = PlanCancellationDecision;
