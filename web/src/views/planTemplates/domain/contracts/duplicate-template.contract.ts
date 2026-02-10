/**
 * DuplicateTemplate Contract
 *
 * Use-case interface for duplicating a plan template.
 * Actor assembles full input by merging template ID with context
 * (currentCount from template list, maxTemplates from constant).
 */
import { Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

export const DuplicateTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type DuplicateTemplateInput = S.Schema.Type<typeof DuplicateTemplateInput>;
