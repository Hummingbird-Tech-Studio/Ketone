/**
 * UpdateTemplate Contract
 *
 * Use-case interface for updating a plan template's name, description, and periods.
 * No decision ADT — input schema validates all fields, actor sends directly to gateway.
 */
import { Schema as S } from 'effect';
import { PlanDescriptionSchema, PlanNameSchema, PlanTemplateId, TemplatePeriodConfig } from '../plan-template.model';

export const UpdateTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  periods: S.Array(TemplatePeriodConfig),
});
export type UpdateTemplateInput = S.Schema.Type<typeof UpdateTemplateInput>;
