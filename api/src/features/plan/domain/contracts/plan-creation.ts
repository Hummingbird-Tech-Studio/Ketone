import { Data, Schema as S } from 'effect';

/**
 * PlanCreationInput - Data required for the plan creation decision.
 */
export const PlanCreationInput = S.Struct({
  userId: S.UUID,
  activePlanId: S.NullOr(S.UUID),
  activeCycleId: S.NullOr(S.UUID),
  periodCount: S.Number,
});
export type PlanCreationInput = S.Schema.Type<typeof PlanCreationInput>;

/**
 * PlanCreationDecision - Reified decision for plan creation.
 *
 * CanCreate: All validations passed, plan can be created
 * BlockedByActiveCycle: User has an active cycle, cannot create plan
 * BlockedByActivePlan: User already has an active plan
 */
export type PlanCreationDecision = Data.TaggedEnum<{
  CanCreate: {};
  BlockedByActiveCycle: { readonly userId: string; readonly cycleId: string };
  BlockedByActivePlan: { readonly userId: string; readonly planId: string };
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
}>;
export const PlanCreationDecision = Data.taggedEnum<PlanCreationDecision>();
