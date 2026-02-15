import { Data, Schema as S } from 'effect';

/**
 * PlanTemplateUpdateInput - Data required for the template update decision.
 */
export const PlanTemplateUpdateInput = S.Struct({
  periodCount: S.Number.pipe(S.int(), S.positive()),
});
export type PlanTemplateUpdateInput = S.Schema.Type<typeof PlanTemplateUpdateInput>;

/**
 * PlanTemplateUpdateDecision - Reified decision for template update.
 *
 * CanUpdate: Period count within valid range, proceed with update
 * InvalidPeriodCount: Period count outside 1-31 bounds
 */
export type PlanTemplateUpdateDecision = Data.TaggedEnum<{
  CanUpdate: {};
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
}>;
export const PlanTemplateUpdateDecision = Data.taggedEnum<PlanTemplateUpdateDecision>();
