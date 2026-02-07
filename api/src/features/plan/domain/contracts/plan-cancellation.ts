import { Data, Schema as S } from 'effect';
import { type CancellationResult, type PlanStatus, PlanId, PlanStatusSchema, PeriodDatesSchema } from '../plan.model';
import type { FastingDateRange } from '../services';

/**
 * PlanCancellationInput - Data required for the plan cancellation decision.
 */
export const PlanCancellationInput = S.Struct({
  planId: PlanId,
  status: PlanStatusSchema,
  periods: S.Array(PeriodDatesSchema),
  now: S.DateFromSelf,
});
export type PlanCancellationInput = S.Schema.Type<typeof PlanCancellationInput>;

/**
 * PlanCancellationDecision - Reified decision for plan cancellation.
 *
 * Cancel: Plan can be cancelled, with per-period outcomes and cycle data to create
 * InvalidState: Plan is not in a cancellable state
 */
export type PlanCancellationDecision = Data.TaggedEnum<{
  Cancel: {
    readonly planId: PlanId;
    readonly results: ReadonlyArray<CancellationResult>;
    readonly completedPeriodsFastingDates: ReadonlyArray<FastingDateRange>;
    readonly inProgressPeriodFastingDates: FastingDateRange | null;
    readonly cancelledAt: Date;
  };
  InvalidState: { readonly planId: PlanId; readonly currentStatus: PlanStatus };
}>;
export const PlanCancellationDecision = Data.taggedEnum<PlanCancellationDecision>();
export const { $is: isPlanCancellationDecision, $match: matchPlanCancellationDecision } = PlanCancellationDecision;
