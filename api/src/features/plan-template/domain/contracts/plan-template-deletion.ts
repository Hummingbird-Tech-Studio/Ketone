import { Data, Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

/**
 * PlanTemplateDeletionInput - Data required for the template deletion decision.
 */
export const PlanTemplateDeletionInput = S.Struct({
  planTemplateId: PlanTemplateId,
  exists: S.Boolean,
});
export type PlanTemplateDeletionInput = S.Schema.Type<typeof PlanTemplateDeletionInput>;

/**
 * PlanTemplateDeletionDecision - Reified decision for template deletion.
 *
 * CanDelete: Template exists and can be deleted
 * TemplateNotFound: Template not found or not owned by user
 */
export type PlanTemplateDeletionDecision = Data.TaggedEnum<{
  CanDelete: {};
  TemplateNotFound: { readonly planTemplateId: PlanTemplateId };
}>;
export const PlanTemplateDeletionDecision = Data.taggedEnum<PlanTemplateDeletionDecision>();
