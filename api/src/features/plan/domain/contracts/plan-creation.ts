import { Schema as S } from 'effect';

/**
 * PlanCreationInput - Data required for the plan creation decision.
 */
export const PlanCreationInput = S.Struct({
  userId: S.UUID,
  activePlanId: S.NullOr(S.UUID),
  activeCycleId: S.NullOr(S.UUID),
  periodCount: S.Number.pipe(S.int(), S.positive()),
});
export type PlanCreationInput = S.Schema.Type<typeof PlanCreationInput>;
