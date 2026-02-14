import { Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

/**
 * PlanTemplateDeletionInput - Data required for the template deletion decision.
 */
export const PlanTemplateDeletionInput = S.Struct({
  planTemplateId: PlanTemplateId,
  exists: S.Boolean,
});
export type PlanTemplateDeletionInput = S.Schema.Type<typeof PlanTemplateDeletionInput>;
