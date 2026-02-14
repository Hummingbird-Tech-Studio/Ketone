import { Schema as S } from 'effect';
import { PlanTemplateId, TemplatePeriodConfig } from '../plan-template.model';

/**
 * PlanTemplateApplicationInput - Data required for the template application decision.
 */
export const PlanTemplateApplicationInput = S.Struct({
  planTemplateId: PlanTemplateId,
  startDate: S.DateFromSelf,
  periodConfigs: S.Array(TemplatePeriodConfig),
});
export type PlanTemplateApplicationInput = S.Schema.Type<typeof PlanTemplateApplicationInput>;
