/**
 * UpdateMetadata Contract
 *
 * Use-case interface for updating a plan's name, description, or start date.
 * Partial update — only provided fields are sent to the API.
 * No decision ADT — server validates plan state.
 */
import { Schema as S } from 'effect';
import { PlanDescriptionSchema, PlanId, PlanNameSchema } from '../plan.model';

export const UpdateMetadataInput = S.Struct({
  planId: PlanId,
  name: S.optional(PlanNameSchema),
  description: S.optional(S.NullOr(PlanDescriptionSchema)),
  startDate: S.optional(S.DateFromSelf),
});
export type UpdateMetadataInput = S.Schema.Type<typeof UpdateMetadataInput>;
