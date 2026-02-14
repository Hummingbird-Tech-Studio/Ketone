/**
 * PlanTemplate Domain Model
 *
 * This file contains:
 * - Constants: Named domain limits (no magic numbers)
 * - Branded Types: PlanTemplateId (module-specific), reused plan brands
 * - Value Objects: TemplatePeriodConfig, PlanTemplateSummary, PlanTemplateDetail
 * - ADTs: SaveTemplateLimitDecision
 * - Smart Constructors: createPlanTemplateId / makePlanTemplateId
 */
import { Data, Effect, Option, ParseResult, Schema as S } from 'effect';
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
// ADTs (Data.TaggedEnum)
// ============================================================================

/**
 * SaveTemplateLimitDecision — Reified decision for save/duplicate guard.
 *
 * CanSave: Under the 20-template limit, proceed
 * LimitReached: User hit the template cap
 */
export type SaveTemplateLimitDecision = Data.TaggedEnum<{
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  CanSave: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;

export const SaveTemplateLimitDecision = Data.taggedEnum<SaveTemplateLimitDecision>();
export const { $match: matchSaveDecision } = SaveTemplateLimitDecision;

// ============================================================================
// Smart Constructors
// ============================================================================

/**
 * Create a PlanTemplateId from an unknown value (effectful).
 * Returns Effect<PlanTemplateId, ParseResult.ParseError>.
 */
export const createPlanTemplateId = (value: unknown): Effect.Effect<PlanTemplateId, ParseResult.ParseError> =>
  S.decodeUnknown(PlanTemplateId)(value);

/**
 * Make a PlanTemplateId from an unknown value (synchronous).
 * Returns Option<PlanTemplateId>.
 */
export const makePlanTemplateId = (value: unknown): Option.Option<PlanTemplateId> =>
  Effect.runSync(Effect.option(createPlanTemplateId(value)));
