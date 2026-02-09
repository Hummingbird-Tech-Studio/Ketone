/**
 * DeleteTemplate Contract
 *
 * Use-case interface for deleting a plan template.
 * No decision ADT — deletion is unconditional on the web side.
 * The API handles not-found errors, which the gateway maps to TemplateNotFoundError.
 */
import { Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

export const DeleteTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
});
export type DeleteTemplateInput = S.Schema.Type<typeof DeleteTemplateInput>;
