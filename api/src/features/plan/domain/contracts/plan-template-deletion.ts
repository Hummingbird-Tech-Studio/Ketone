import { Data, Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

/**
 * PlanTemplateDeletionInput - Data required for the template deletion decision.
 */
export const PlanTemplateDeletionInput = S.Struct({
  planTemplateId: PlanTemplateId,
  templateExists: S.Boolean,
});
export type PlanTemplateDeletionInput = S.Schema.Type<typeof PlanTemplateDeletionInput>;

/**
 * PlanTemplateDeletionDecision - Reified decision for template deletion.
 *
 * Thin contract per Rule 6 — existence is verified in collection phase,
 * the decision formalizes the operation boundary.
 *
 * CanDelete: Template exists and belongs to user, proceed
 * TemplateNotFound: Template does not exist or is not owned by user
 */
export type PlanTemplateDeletionDecision = Data.TaggedEnum<{
  CanDelete: {};
  TemplateNotFound: { readonly planTemplateId: PlanTemplateId };
}>;
export const PlanTemplateDeletionDecision = Data.taggedEnum<PlanTemplateDeletionDecision>();
