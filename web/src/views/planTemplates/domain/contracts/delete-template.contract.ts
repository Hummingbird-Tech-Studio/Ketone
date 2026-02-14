/**
 * DeleteTemplate Contract
 *
 * Use-case interface for deleting a plan template.
 * It represents the input data required to delete a plan template.
 */
import { Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

const DeleteTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
});
export type DeleteTemplateInput = S.Schema.Type<typeof DeleteTemplateInput>;
