import { Data, Schema as S } from 'effect';
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

/**
 * PlanTemplateApplicationDecision - Reified decision for template application.
 *
 * Plan creation rules (active plan limit, cycle conflict) are evaluated
 * downstream by existing PlanCreationDecision in PlanService.
 *
 * CanApply: Template valid, carries configs for downstream plan creation
 * EmptyTemplate: Template has no period configs
 */
export type PlanTemplateApplicationDecision = Data.TaggedEnum<{
  CanApply: { readonly periodConfigs: ReadonlyArray<TemplatePeriodConfig> };
  EmptyTemplate: { readonly planTemplateId: PlanTemplateId };
}>;
export const PlanTemplateApplicationDecision = Data.taggedEnum<PlanTemplateApplicationDecision>();
