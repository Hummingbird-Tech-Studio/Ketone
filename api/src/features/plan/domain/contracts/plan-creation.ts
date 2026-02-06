import { Data } from 'effect';

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
}>;
export const PlanCreationDecision = Data.taggedEnum<PlanCreationDecision>();
