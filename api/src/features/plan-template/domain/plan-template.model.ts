import { Schema as S } from 'effect';
import {
  PlanNameSchema,
  PlanDescriptionSchema,
  PeriodOrderSchema,
  PeriodCountSchema,
  FastingDurationSchema,
  EatingWindowSchema,
} from '../../plan/domain/plan.model';

// ─── Constants ──────────────────────────────────────────────────────────────

export const MAX_PLAN_TEMPLATES = 20;

// ─── Branded IDs ────────────────────────────────────────────────────────────

export const PlanTemplateId = S.UUID.pipe(S.brand('PlanTemplateId'));
export type PlanTemplateId = S.Schema.Type<typeof PlanTemplateId>;

// ─── Value Objects ──────────────────────────────────────────────────────────

/**
 * TemplatePeriodConfig Value Object
 *
 * Pure value object: order + fasting duration + eating window.
 * No identity field — DB id is a persistence concern.
 */
export class TemplatePeriodConfig extends S.Class<TemplatePeriodConfig>('TemplatePeriodConfig')({
  order: PeriodOrderSchema,
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}

// ─── Entities & Aggregates ──────────────────────────────────────────────────

/**
 * PlanTemplate Entity
 *
 * Root aggregate for reusable plan templates.
 * Templates are pure blueprints — no reference to source plans.
 */
export class PlanTemplate extends S.Class<PlanTemplate>('PlanTemplate')({
  id: PlanTemplateId,
  userId: S.UUID,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  periodCount: PeriodCountSchema,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
  lastUsedAt: S.NullOr(S.DateFromSelf),
}) {}

/**
 * PlanTemplateWithPeriods Aggregate
 *
 * A PlanTemplate with all its child TemplatePeriodConfig value objects.
 */
export class PlanTemplateWithPeriods extends S.Class<PlanTemplateWithPeriods>('PlanTemplateWithPeriods')({
  ...PlanTemplate.fields,
  periods: S.Array(TemplatePeriodConfig),
}) {}
