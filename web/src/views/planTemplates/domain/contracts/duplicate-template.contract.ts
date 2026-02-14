/**
 * DuplicateTemplate Contract
 *
 * Use-case interface for duplicating a plan template.
 * It represents input data for duplicating a plan template.
 */
import { Schema as S } from 'effect';
import { PlanTemplateId } from '../plan-template.model';

const DuplicateTemplateInput = S.Struct({
  planTemplateId: PlanTemplateId,
  currentCount: S.Number,
  maxTemplates: S.Number,
});
export type DuplicateTemplateInput = S.Schema.Type<typeof DuplicateTemplateInput>;
