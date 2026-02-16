/**
 * CreateFromPlan Contract
 *
 * Use-case interface for saving a plan as a template.
 */
import { PlanId } from '@/views/plan/domain/plan.model';
import { Schema as S } from 'effect';

/**
 * Full decision input — what the FC decision function needs.
 */
const CreateFromPlanInput = S.Struct({
  /** UUID of the plan to save as a template. */
  planId: PlanId,
  /** How many templates the user already has. */
  currentCount: S.Number,
  /** Maximum number of templates allowed per user. */
  maxTemplates: S.Number,
});
export type CreateFromPlanInput = S.Schema.Type<typeof CreateFromPlanInput>;
