import { Data } from 'effect';

/**
 * PlanCreationInput - Data required for the plan creation decision.
 */
export interface PlanCreationInput {
  readonly userId: string;
  readonly activePlanId: string | null;
  readonly activeCycleId: string | null;
  readonly periodCount: number;
}

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
// TODO: Why this is not used?
export const { $is: isPlanCreationDecision, $match: matchPlanCreationDecision } = PlanCreationDecision;
