import { Schema as S } from 'effect';

/**
 * PlanTemplateUpdateInput - Data required for the template update decision.
 */
export const PlanTemplateUpdateInput = S.Struct({
  periodCount: S.Number.pipe(S.int(), S.positive()),
});
export type PlanTemplateUpdateInput = S.Schema.Type<typeof PlanTemplateUpdateInput>;
