import { Data, Schema as S } from 'effect';
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

// ─── Decision ADTs ──────────────────────────────────────────────────────────

/**
 * PlanTemplateCreationDecision - Reified decision for template creation.
 *
 * CanCreate: Limit not reached, proceed with creation
 * LimitReached: User has hit the template limit
 */
export type PlanTemplateCreationDecision = Data.TaggedEnum<{
  CanCreate: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;
export const PlanTemplateCreationDecision = Data.taggedEnum<PlanTemplateCreationDecision>();

/**
 * PlanTemplateDuplicationDecision - Reified decision for template duplication.
 *
 * CanDuplicate: Limit not reached, proceed with duplication
 * LimitReached: User has hit the template limit
 */
export type PlanTemplateDuplicationDecision = Data.TaggedEnum<{
  CanDuplicate: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;
export const PlanTemplateDuplicationDecision = Data.taggedEnum<PlanTemplateDuplicationDecision>();

/**
 * PlanTemplateUpdateDecision - Reified decision for template update.
 *
 * CanUpdate: Period count within valid range, proceed with update
 * InvalidPeriodCount: Period count outside 1-31 bounds
 */
export type PlanTemplateUpdateDecision = Data.TaggedEnum<{
  CanUpdate: {};
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
}>;
export const PlanTemplateUpdateDecision = Data.taggedEnum<PlanTemplateUpdateDecision>();

/**
 * PlanTemplateDeletionDecision - Reified decision for template deletion.
 *
 * CanDelete: Template exists and can be deleted
 * TemplateNotFound: Template not found or not owned by user
 */
export type PlanTemplateDeletionDecision = Data.TaggedEnum<{
  CanDelete: {};
  TemplateNotFound: { readonly planTemplateId: PlanTemplateId };
}>;
export const PlanTemplateDeletionDecision = Data.taggedEnum<PlanTemplateDeletionDecision>();

/**
 * PlanTemplateApplicationDecision - Reified decision for template application.
 *
 * Plan creation rules (active plan limit, cycle conflict) are evaluated
 * downstream by existing PlanCreationDecision in PlanService.
 *
 * CanApply: Template valid, carries configs for downstream plan creation
 * EmptyTemplate: Template has no period configs
 */
export type PlanTemplateApplicationDecision = Data.TaggedEnum<{
  CanApply: { readonly periodConfigs: ReadonlyArray<TemplatePeriodConfig> };
  EmptyTemplate: { readonly planTemplateId: PlanTemplateId };
}>;
export const PlanTemplateApplicationDecision = Data.taggedEnum<PlanTemplateApplicationDecision>();
