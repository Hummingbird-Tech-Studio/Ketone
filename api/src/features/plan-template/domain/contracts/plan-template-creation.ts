import { Schema as S } from 'effect';

/**
 * PlanTemplateCreationInput - Data required for the template creation decision.
 */
export const PlanTemplateCreationInput = S.Struct({
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type PlanTemplateCreationInput = S.Schema.Type<typeof PlanTemplateCreationInput>;
