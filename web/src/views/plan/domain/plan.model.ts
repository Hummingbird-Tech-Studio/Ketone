/**
 * Plan Domain Model
 *
 * This file contains:
 * - Constants: Named domain limits (no magic numbers)
 * - Branded Types: PlanId, PeriodId, PlanName, PlanDescription, FastingDuration, EatingWindow, PeriodOrder, PeriodCount
 * - Value Objects: PlanPeriodConfig, PlanPeriodUpdate, PlanPeriod, PlanSummary, PlanDetail
 * - ADTs: SaveTimelineDecision
 * - Smart Constructors: createPlanId / makePlanId, createPeriodId / makePeriodId
 */
import { PlanStatusSchema } from '@ketone/shared';
import { Brand, Data, Effect, Option, ParseResult, Schema as S } from 'effect';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
} from '../constants';

// ============================================================================
// Constants
// ============================================================================

export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
export const MAX_PLAN_DESCRIPTION_LENGTH = 500;

// Re-export shared constants for convenience
export {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
} from '../constants';

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Unique identifier for a plan (UUID).
 */
export const PlanId = S.UUID.pipe(S.brand('PlanId'));
export type PlanId = S.Schema.Type<typeof PlanId>;

/**
 * Unique identifier for a period (UUID).
 */
export const PeriodId = S.UUID.pipe(S.brand('PeriodId'));
export type PeriodId = S.Schema.Type<typeof PeriodId>;

/**
 * Plan name (1-100 characters).
 */
export type PlanName = string & Brand.Brand<'PlanName'>;

export const PlanName = Brand.refined<PlanName>(
  (s) => s.length >= MIN_PLAN_NAME_LENGTH && s.length <= MAX_PLAN_NAME_LENGTH,
  (s) =>
    Brand.error(`Expected plan name between ${MIN_PLAN_NAME_LENGTH}-${MAX_PLAN_NAME_LENGTH} chars, got ${s.length}`),
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

// ============================================================================
// PlanStatus (type alias — re-export from @ketone/shared)
// ============================================================================

/**
 * PlanStatus is a closed literal union: 'InProgress' | 'Completed' | 'Cancelled'.
 * Defined in @ketone/shared as PlanStatusSchema. Re-exported here for convenience.
 */
export type { PlanStatus } from '@ketone/shared';
export { PlanStatusSchema };

// ============================================================================
// Value Objects (S.Class)
// ============================================================================

/**
 * PlanPeriodConfig Value Object
 *
 * Used for plan creation: order + fasting duration + eating window.
 * No identity field — created before periods exist in DB.
 */
export class PlanPeriodConfig extends S.Class<PlanPeriodConfig>('PlanPeriodConfig')({
  order: PeriodOrderSchema,
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}

/**
 * PlanPeriodUpdate Value Object
 *
 * Used for period updates: optional id (undefined for new periods) + durations.
 * Distinguishes between existing periods (have id) and newly added ones.
 */
export class PlanPeriodUpdate extends S.Class<PlanPeriodUpdate>('PlanPeriodUpdate')({
  id: S.optional(PeriodId),
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}

/**
 * PlanPeriod Value Object
 *
 * Full period representation decoded from API response.
 * Contains all date phases (fasting start/end, eating start/end).
 */
export class PlanPeriod extends S.Class<PlanPeriod>('PlanPeriod')({
  id: PeriodId,
  planId: PlanId,
  order: PeriodOrderSchema,
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  fastingStartDate: S.DateFromSelf,
  fastingEndDate: S.DateFromSelf,
  eatingStartDate: S.DateFromSelf,
  eatingEndDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}

/**
 * PlanSummary Value Object
 *
 * Lightweight representation for the list page.
 * Maps 1:1 with PlanResponseSchema from @ketone/shared.
 * Does NOT include endDate or periodCount (those are derived from PlanDetail.periods).
 */
export class PlanSummary extends S.Class<PlanSummary>('PlanSummary')({
  id: PlanId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  status: PlanStatusSchema,
  startDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}

/**
 * PlanDetail Value Object
 *
 * Full plan representation for the edit/view screens.
 * Includes child periods and periodCount for display.
 */
export class PlanDetail extends S.Class<PlanDetail>('PlanDetail')({
  id: PlanId,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  status: PlanStatusSchema,
  startDate: S.DateFromSelf,
  periodCount: PeriodCountSchema,
  periods: S.Array(PlanPeriod),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}

// ============================================================================
// ADTs (Data.TaggedEnum)
// ============================================================================

/**
 * SaveTimelineDecision — Reified decision for the plan edit save flow.
 *
 * Determines what changed in the timeline and what API calls are needed:
 * - NoChanges: nothing to save, skip
 * - OnlyStartDate: only start date changed → update metadata
 * - OnlyPeriods: only period durations changed → update periods
 * - StartDateAndPeriods: both changed → update metadata then periods (sequential)
 */
export type SaveTimelineDecision = Data.TaggedEnum<{
  NoChanges: {};
  OnlyStartDate: { readonly startDate: Date };
  OnlyPeriods: { readonly periods: ReadonlyArray<PlanPeriodUpdate> };
  StartDateAndPeriods: { readonly startDate: Date; readonly periods: ReadonlyArray<PlanPeriodUpdate> };
}>;

export const SaveTimelineDecision = Data.taggedEnum<SaveTimelineDecision>();
export const { $is: isSaveTimelineDecision, $match: matchSaveTimelineDecision } = SaveTimelineDecision;

// ============================================================================
// Smart Constructors
// ============================================================================

/**
 * Create a PlanId from an unknown value (effectful).
 * Returns Effect<PlanId, ParseResult.ParseError>.
 */
export const createPlanId = (value: unknown): Effect.Effect<PlanId, ParseResult.ParseError> =>
  S.decodeUnknown(PlanId)(value);

/**
 * Make a PlanId from an unknown value (synchronous).
 * Returns Option<PlanId>.
 */
export const makePlanId = (value: unknown): Option.Option<PlanId> => Effect.runSync(Effect.option(createPlanId(value)));

/**
 * Create a PeriodId from an unknown value (effectful).
 * Returns Effect<PeriodId, ParseResult.ParseError>.
 */
export const createPeriodId = (value: unknown): Effect.Effect<PeriodId, ParseResult.ParseError> =>
  S.decodeUnknown(PeriodId)(value);

/**
 * Make a PeriodId from an unknown value (synchronous).
 * Returns Option<PeriodId>.
 */
export const makePeriodId = (value: unknown): Option.Option<PeriodId> =>
  Effect.runSync(Effect.option(createPeriodId(value)));
