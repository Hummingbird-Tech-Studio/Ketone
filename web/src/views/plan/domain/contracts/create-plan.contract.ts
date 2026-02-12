/**
 * CreatePlan Contract
 *
 * Use-case interface for creating a new fasting plan.
 * No client-side decision ADT — server validates exclusivity
 * (active plan, active cycle, overlap).
 */
import { Schema as S } from 'effect';
import {
  EatingWindowSchema,
  FastingDurationSchema,
  PlanDescriptionSchema,
  PlanNameSchema,
} from '../plan.model';

export const CreatePlanInput = S.Struct({
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  startDate: S.DateFromSelf,
  periods: S.Array(
    S.Struct({
      fastingDuration: FastingDurationSchema,
      eatingWindow: EatingWindowSchema,
    }),
  ),
});
export type CreatePlanInput = S.Schema.Type<typeof CreatePlanInput>;
