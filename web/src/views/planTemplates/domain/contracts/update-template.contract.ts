/**
 * UpdateTemplate Contract
 *
 * Use-case interface for updating a plan template's name, description, and periods.
 * It represents the input data required to update a plan template.
 */
import { Schema as S } from 'effect';
import { PlanDescriptionSchema, PlanNameSchema, PlanTemplateId, TemplatePeriodConfig } from '../plan-template.model';

const UpdateTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  periods: S.Array(TemplatePeriodConfig),
});
export type UpdateTemplateInput = S.Schema.Type<typeof UpdateTemplateInput>;
