import { Schema as S } from 'effect';

/**
 * PlanTemplateDuplicationInput - Data required for the template duplication decision.
 */
export const PlanTemplateDuplicationInput = S.Struct({
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type PlanTemplateDuplicationInput = S.Schema.Type<typeof PlanTemplateDuplicationInput>;
