import { Data, Schema as S } from 'effect';

/**
 * PlanTemplateCreationInput - Data required for the template creation decision.
 */
export const PlanTemplateCreationInput = S.Struct({
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type PlanTemplateCreationInput = S.Schema.Type<typeof PlanTemplateCreationInput>;

/**
 * PlanTemplateCreationDecision - Reified decision for template creation.
 *
 * CanCreate: Limit not reached, proceed with creation
 * LimitReached: User has hit the template limit
 */
export type PlanTemplateCreationDecision = Data.TaggedEnum<{
  CanCreate: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;
export const PlanTemplateCreationDecision = Data.taggedEnum<PlanTemplateCreationDecision>();
