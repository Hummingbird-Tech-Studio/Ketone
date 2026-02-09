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
import { Brand, Data, Effect, Option, ParseResult, Schema as S } from 'effect';
import {
  MIN_FASTING_DURATION_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MAX_EATING_WINDOW_HOURS,
  MIN_PERIODS,
  MAX_PERIODS,
} from '../../plan/constants';

// ============================================================================
// Constants
// ============================================================================

export const MAX_PLAN_TEMPLATES = 20;
export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
export const MAX_PLAN_DESCRIPTION_LENGTH = 500;

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Unique identifier for a plan template (UUID).
 */
export const PlanTemplateId = S.UUID.pipe(S.brand('PlanTemplateId'));
export type PlanTemplateId = S.Schema.Type<typeof PlanTemplateId>;

/**
 * Fasting duration in hours (1-168, 15-minute increments).
 */
export type FastingDuration = number & Brand.Brand<'FastingDuration'>;

export const FastingDuration = Brand.refined<FastingDuration>(
  (n) => n >= MIN_FASTING_DURATION_HOURS && n <= MAX_FASTING_DURATION_HOURS && Number.isInteger(n * 4),
  (n) =>
    Brand.error(
      `Expected fasting duration between ${MIN_FASTING_DURATION_HOURS}-${MAX_FASTING_DURATION_HOURS}h in 15-min increments, got ${n}`,
    ),
);

export const FastingDurationSchema = S.Number.pipe(S.fromBrand(FastingDuration));

/**
 * Eating window in hours (1-24, 15-minute increments).
 */
export type EatingWindow = number & Brand.Brand<'EatingWindow'>;

export const EatingWindow = Brand.refined<EatingWindow>(
  (n) => n >= MIN_EATING_WINDOW_HOURS && n <= MAX_EATING_WINDOW_HOURS && Number.isInteger(n * 4),
  (n) =>
    Brand.error(
      `Expected eating window between ${MIN_EATING_WINDOW_HOURS}-${MAX_EATING_WINDOW_HOURS}h in 15-min increments, got ${n}`,
    ),
);

export const EatingWindowSchema = S.Number.pipe(S.fromBrand(EatingWindow));

/**
 * 1-based position of a period within a plan (1-31).
 */
export type PeriodOrder = number & Brand.Brand<'PeriodOrder'>;

export const PeriodOrder = Brand.refined<PeriodOrder>(
  (n) => Number.isInteger(n) && n >= MIN_PERIODS && n <= MAX_PERIODS,
  (n) => Brand.error(`Expected period order between ${MIN_PERIODS}-${MAX_PERIODS}, got ${n}`),
);

export const PeriodOrderSchema = S.Number.pipe(S.fromBrand(PeriodOrder));

/**
 * Total number of periods in a plan (1-31).
 */
export type PeriodCount = number & Brand.Brand<'PeriodCount'>;

export const PeriodCount = Brand.refined<PeriodCount>(
  (n) => Number.isInteger(n) && n >= MIN_PERIODS && n <= MAX_PERIODS,
  (n) => Brand.error(`Expected period count between ${MIN_PERIODS}-${MAX_PERIODS}, got ${n}`),
);

export const PeriodCountSchema = S.Number.pipe(S.fromBrand(PeriodCount));

/**
 * Plan name (1-100 characters).
 */
export type PlanName = string & Brand.Brand<'PlanName'>;

export const PlanName = Brand.refined<PlanName>(
  (s) => s.length >= MIN_PLAN_NAME_LENGTH && s.length <= MAX_PLAN_NAME_LENGTH,
  (s) =>
    Brand.error(
      `Expected plan name between ${MIN_PLAN_NAME_LENGTH}-${MAX_PLAN_NAME_LENGTH} chars, got ${s.length}`,
    ),
);

export const PlanNameSchema = S.String.pipe(S.fromBrand(PlanName));

/**
 * Plan description (0-500 characters).
 */
export type PlanDescription = string & Brand.Brand<'PlanDescription'>;

export const PlanDescription = Brand.refined<PlanDescription>(
  (s) => s.length <= MAX_PLAN_DESCRIPTION_LENGTH,
  (s) => Brand.error(`Expected plan description at most ${MAX_PLAN_DESCRIPTION_LENGTH} chars, got ${s.length}`),
);

export const PlanDescriptionSchema = S.String.pipe(S.fromBrand(PlanDescription));

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
  CanSave: {};
  LimitReached: { readonly currentCount: number; readonly maxTemplates: number };
}>;

export const SaveTemplateLimitDecision = Data.taggedEnum<SaveTemplateLimitDecision>();
export const { $is: isSaveDecision, $match: matchSaveDecision } = SaveTemplateLimitDecision;

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
