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
import type { SaveTemplateLimitDecision } from '../plan-template.model';

/**
 * Full decision input — what the FC decision function needs.
 */
export const CreateFromPlanInput = S.Struct({
  planId: S.UUID,
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type CreateFromPlanInput = S.Schema.Type<typeof CreateFromPlanInput>;

/**
 * Decision ADT: SaveTemplateLimitDecision
 * - CanSave: under limit, proceed with API call
 * - LimitReached: show limit message
 */
export type CreateFromPlanDecision = SaveTemplateLimitDecision;
