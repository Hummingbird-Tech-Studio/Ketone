/**
 * CreateFromPlan Contract
 *
 * Use-case interface for saving a plan as a template.
 *
 * Input Schema (`CreateFromPlanInputSchema`) validates only `planId` (user-provided).
 * Actor assembles the full contract input by merging validated input with context
 * (currentCount from template list, maxTemplates from constant).
 */
import { Schema as S } from 'effect';

/**
 * Full decision input — what the FC decision function needs.
 */
export const CreateFromPlanInput = S.Struct({
  planId: S.UUID,
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type CreateFromPlanInput = S.Schema.Type<typeof CreateFromPlanInput>;
