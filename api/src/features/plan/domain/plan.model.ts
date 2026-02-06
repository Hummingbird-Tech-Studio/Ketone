import { Brand, Data, Match } from 'effect';
import type { PlanStatus } from '@ketone/shared';

// Re-export for convenience
export type { PlanStatus } from '@ketone/shared';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MIN_FASTING_DURATION = 1;
export const MAX_FASTING_DURATION = 168;
export const MIN_EATING_WINDOW = 1;
export const MAX_EATING_WINDOW = 24;
export const MIN_PERIODS = 1;
export const MAX_PERIODS = 31;
export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
export const MAX_PLAN_DESCRIPTION_LENGTH = 500;

// ─── Branded Types ───────────────────────────────────────────────────────────

/**
 * Fasting duration in hours (1-168, 15-minute increments).
 * Valid examples: 1, 1.25, 1.5, 16, 168
 * Invalid: 0, 0.1, 1.33, 169
 */
export type FastingDuration = number & Brand.Brand<'FastingDuration'>;

export const FastingDuration = Brand.refined<FastingDuration>(
  (n) => n >= MIN_FASTING_DURATION && n <= MAX_FASTING_DURATION && Number.isInteger(n * 4),
  (n) =>
    Brand.error(
      `Expected fasting duration between ${MIN_FASTING_DURATION}-${MAX_FASTING_DURATION}h in 15-min increments, got ${n}`,
    ),
);

/**
 * Eating window in hours (1-24, 15-minute increments).
 */
export type EatingWindow = number & Brand.Brand<'EatingWindow'>;

export const EatingWindow = Brand.refined<EatingWindow>(
  (n) => n >= MIN_EATING_WINDOW && n <= MAX_EATING_WINDOW && Number.isInteger(n * 4),
  (n) =>
    Brand.error(
      `Expected eating window between ${MIN_EATING_WINDOW}-${MAX_EATING_WINDOW}h in 15-min increments, got ${n}`,
    ),
);

/**
 * 1-based position of a period within a plan (1-31).
 */
export type PeriodOrder = number & Brand.Brand<'PeriodOrder'>;

export const PeriodOrder = Brand.refined<PeriodOrder>(
  (n) => Number.isInteger(n) && n >= MIN_PERIODS && n <= MAX_PERIODS,
  (n) => Brand.error(`Expected period order between ${MIN_PERIODS}-${MAX_PERIODS}, got ${n}`),
);

/**
 * Total number of periods in a plan (1-31).
 */
export type PeriodCount = number & Brand.Brand<'PeriodCount'>;

export const PeriodCount = Brand.refined<PeriodCount>(
  (n) => Number.isInteger(n) && n >= MIN_PERIODS && n <= MAX_PERIODS,
  (n) => Brand.error(`Expected period count between ${MIN_PERIODS}-${MAX_PERIODS}, got ${n}`),
);

/**
 * Plan name (1-100 characters).
 */
export type PlanName = string & Brand.Brand<'PlanName'>;

export const PlanName = Brand.refined<PlanName>(
  (s) => s.length >= MIN_PLAN_NAME_LENGTH && s.length <= MAX_PLAN_NAME_LENGTH,
  (s) =>
    Brand.error(`Expected plan name between ${MIN_PLAN_NAME_LENGTH}-${MAX_PLAN_NAME_LENGTH} chars, got ${s.length}`),
);

/**
 * Plan description (0-500 characters).
 */
export type PlanDescription = string & Brand.Brand<'PlanDescription'>;

export const PlanDescription = Brand.refined<PlanDescription>(
  (s) => s.length <= MAX_PLAN_DESCRIPTION_LENGTH,
  (s) => Brand.error(`Expected plan description at most ${MAX_PLAN_DESCRIPTION_LENGTH} chars, got ${s.length}`),
);

// ─── Value Objects ───────────────────────────────────────────────────────────

/**
 * A fasting+eating duration pair. Always travel together.
 */
export interface PeriodConfig {
  readonly fastingDuration: FastingDuration;
  readonly eatingWindow: EatingWindow;
}

/**
 * Computed date range for a period with all phase timestamps.
 *
 * Invariants (spec §2.3):
 * - startDate === fastingStartDate
 * - endDate === eatingEndDate
 * - fastingStartDate < fastingEndDate
 * - fastingEndDate <= eatingStartDate
 * - eatingStartDate < eatingEndDate
 * - endDate > startDate
 */
export interface PeriodDateRange {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly fastingStartDate: Date;
  readonly fastingEndDate: Date;
  readonly eatingStartDate: Date;
  readonly eatingEndDate: Date;
}

/**
 * Validate that a PeriodDateRange satisfies all phase ordering invariants.
 * Returns true if valid, false otherwise.
 */
export const isValidPeriodDateRange = (range: PeriodDateRange): boolean =>
  range.startDate.getTime() === range.fastingStartDate.getTime() &&
  range.endDate.getTime() === range.eatingEndDate.getTime() &&
  range.fastingStartDate < range.fastingEndDate &&
  range.fastingEndDate <= range.eatingStartDate &&
  range.eatingStartDate < range.eatingEndDate &&
  range.endDate > range.startDate;

// ─── Tagged Enums ────────────────────────────────────────────────────────────

/**
 * Classifies a period's state relative to a point in time.
 * Used during cancellation to decide cycle creation (spec §4.4).
 *
 * - Completed: all phases elapsed (now >= period.endDate)
 * - InProgress: currently executing (now >= period.startDate && now < period.endDate)
 * - Scheduled: not yet started (now < period.startDate)
 */
export type PeriodClassification = Data.TaggedEnum<{
  Completed: { readonly period: PeriodDateRange };
  InProgress: { readonly period: PeriodDateRange; readonly now: Date };
  Scheduled: { readonly period: PeriodDateRange };
}>;

export const PeriodClassification = Data.taggedEnum<PeriodClassification>();
export const { Completed, InProgress, Scheduled } = PeriodClassification;

/**
 * Result of converting a period to a cycle during cancellation/completion.
 *
 * Cycle conversion rules (spec §4.4, BR-03):
 * - Completed period: cycle.endDate = period.fastingEndDate
 * - InProgress period: cycle.endDate = min(period.fastingEndDate, now)
 * - Scheduled period: Skipped (no cycle created)
 */
export type CycleConversionResult = Data.TaggedEnum<{
  Created: { readonly startDate: Date; readonly endDate: Date };
  Skipped: { readonly reason: string };
}>;

export const CycleConversionResult = Data.taggedEnum<CycleConversionResult>();

/**
 * Exhaustive matcher for PeriodClassification.
 * Forces handling of all variants at compile time.
 */
export const matchClassification = Match.typeTags<PeriodClassification>();

/**
 * Exhaustive matcher for CycleConversionResult.
 */
export const matchConversionResult = Match.typeTags<CycleConversionResult>();
