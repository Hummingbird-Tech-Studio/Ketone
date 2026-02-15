/**
 * PlanTemplate Domain Model
 *
 * This file contains:
 * - Constants: Named domain limits (no magic numbers)
 * - Branded Types: PlanTemplateId (module-specific), reused plan brands
 * - Value Objects: TemplatePeriodConfig, PlanTemplateSummary, PlanTemplateDetail
 * - Smart Constructors: createPlanTemplateId / makePlanTemplateId
 */
import { Effect, Option, ParseResult, Schema as S } from 'effect';
import {
  EatingWindow,
  EatingWindowSchema,
  FastingDuration,
  FastingDurationSchema,
  PeriodCount,
  PeriodCountSchema,
  PeriodOrder,
  PeriodOrderSchema,
  PlanDescription,
  PlanDescriptionSchema,
  PlanName,
  PlanNameSchema,
} from '../../plan/domain';

// ============================================================================
// Constants (template-specific)
// ============================================================================

export const MAX_PLAN_TEMPLATES = 20;

// Re-export shared branded types for consumers importing from planTemplates/domain
export {
  EatingWindow,
  EatingWindowSchema,
  FastingDuration,
  FastingDurationSchema,
  PeriodCount,
  PeriodCountSchema,
  PeriodOrder,
  PeriodOrderSchema,
  PlanDescription,
  PlanDescriptionSchema,
  PlanName,
  PlanNameSchema,
};

// ============================================================================
// Branded Types (template-specific)
// ============================================================================

/**
 * Unique identifier for a plan template (UUID).
 */
export const PlanTemplateId = S.UUID.pipe(S.brand('PlanTemplateId'));
export type PlanTemplateId = S.Schema.Type<typeof PlanTemplateId>;

// ============================================================================
// Value Objects (S.Class)
// ============================================================================

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

/**
 * PlanTemplateSummary Value Object
 *
 * Lightweight representation for the list page cards.
 * Contains only the fields needed for card display + sort.
 */
export class PlanTemplateSummary extends S.Class<PlanTemplateSummary>('PlanTemplateSummary')({
  id: PlanTemplateId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  periodCount: PeriodCountSchema,
  updatedAt: S.DateFromSelf,
}) {}

/**
 * PlanTemplateDetail Value Object
 *
 * Full template representation for the edit screen.
 * Includes child period configs for editing.
 */
export class PlanTemplateDetail extends S.Class<PlanTemplateDetail>('PlanTemplateDetail')({
  id: PlanTemplateId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  periodCount: PeriodCountSchema,
  periods: S.Array(TemplatePeriodConfig),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}

// ============================================================================
// Smart Constructors
// ============================================================================

/**
 * Create a PlanTemplateId from an unknown value (effectful).
 * Returns Effect<PlanTemplateId, ParseResult.ParseError>.
 */
const createPlanTemplateId = (value: unknown): Effect.Effect<PlanTemplateId, ParseResult.ParseError> =>
  S.decodeUnknown(PlanTemplateId)(value);

/**
 * Make a PlanTemplateId from an unknown value (synchronous).
 * Returns Option<PlanTemplateId>.
 */
export const makePlanTemplateId = (value: unknown): Option.Option<PlanTemplateId> =>
  Effect.runSync(Effect.option(createPlanTemplateId(value)));
