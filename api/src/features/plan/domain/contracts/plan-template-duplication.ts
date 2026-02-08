import { Data, Schema as S } from 'effect';

/**
 * PlanTemplateDuplicationInput - Data required for the template duplication decision.
 */
export const PlanTemplateDuplicationInput = S.Struct({
  currentTemplateCount: S.Number,
  maxTemplates: S.Number,
});
export type PlanTemplateDuplicationInput = S.Schema.Type<typeof PlanTemplateDuplicationInput>;

/**
 * PlanTemplateDuplicationDecision - Reified decision for template duplication.
 *
 * CanDuplicate: Limit not reached, proceed with duplication
 * LimitReached: User has hit the template limit
 */
export type PlanTemplateDuplicationDecision = Data.TaggedEnum<{
  CanDuplicate: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;
export const PlanTemplateDuplicationDecision = Data.taggedEnum<PlanTemplateDuplicationDecision>();
