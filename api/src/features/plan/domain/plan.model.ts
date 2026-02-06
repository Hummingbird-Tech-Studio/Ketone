import { Brand, Data, Effect, Option, ParseResult, Schema as S } from 'effect';

// ─── Branded IDs ────────────────────────────────────────────────────────────

export const PlanId = S.UUID.pipe(S.brand('PlanId'));
export type PlanId = S.Schema.Type<typeof PlanId>;

export const PeriodId = S.UUID.pipe(S.brand('PeriodId'));
export type PeriodId = S.Schema.Type<typeof PeriodId>;

// ─── Literal Enum ───────────────────────────────────────────────────────────

export const PlanStatus = {
  InProgress: 'InProgress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
} as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];
export const PlanStatusSchema = S.Literal('InProgress', 'Completed', 'Cancelled');

// ─── Constants ──────────────────────────────────────────────────────────────

export const MIN_FASTING_DURATION = 1;
export const MAX_FASTING_DURATION = 168;
export const MIN_EATING_WINDOW = 1;
export const MAX_EATING_WINDOW = 24;
export const MIN_PERIODS = 1;
export const MAX_PERIODS = 31;
export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
export const MAX_PLAN_DESCRIPTION_LENGTH = 500;

// ─── Branded Types ──────────────────────────────────────────────────────────

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

export const FastingDurationSchema = S.Number.pipe(S.fromBrand(FastingDuration));

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

// ─── Value Objects ──────────────────────────────────────────────────────────

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

const PeriodDateRangeSchema = S.Struct({
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  fastingStartDate: S.DateFromSelf,
  fastingEndDate: S.DateFromSelf,
  eatingStartDate: S.DateFromSelf,
  eatingEndDate: S.DateFromSelf,
}).pipe(
  S.filter((range) =>
    isValidPeriodDateRange(range)
      ? undefined
      : 'PeriodDateRange must satisfy phase ordering: startDate === fastingStartDate, endDate === eatingEndDate, fastingStart < fastingEnd <= eatingStart < eatingEnd',
  ),
);

/**
 * Smart constructor returning Effect for effectful contexts.
 * Validates all 6 phase ordering invariants (spec §2.3).
 */
export const createPeriodDateRange = (
  startDate: Date,
  endDate: Date,
  fastingStartDate: Date,
  fastingEndDate: Date,
  eatingStartDate: Date,
  eatingEndDate: Date,
): Effect.Effect<PeriodDateRange, ParseResult.ParseError> =>
  S.decodeUnknown(PeriodDateRangeSchema)({
    startDate,
    endDate,
    fastingStartDate,
    fastingEndDate,
    eatingStartDate,
    eatingEndDate,
  });

/**
 * Smart constructor returning Option for synchronous contexts.
 * Validates all 6 phase ordering invariants (spec §2.3).
 */
export const makePeriodDateRange = (
  startDate: Date,
  endDate: Date,
  fastingStartDate: Date,
  fastingEndDate: Date,
  eatingStartDate: Date,
  eatingEndDate: Date,
): Option.Option<PeriodDateRange> =>
  Effect.runSync(
    Effect.option(
      createPeriodDateRange(startDate, endDate, fastingStartDate, fastingEndDate, eatingStartDate, eatingEndDate),
    ),
  );

// ─── Tagged Enums ───────────────────────────────────────────────────────────

/**
 * CancellationResult - Per-period outcome when a plan is cancelled.
 * Used to determine what happens to each period during cancellation.
 *
 * - CompletedPeriod: Period was fully completed (fasting + eating phases elapsed)
 * - PartialFastingPeriod: Period is in fasting phase (truncated at cancellation time)
 * - CompletedFastingInEatingPhase: Period is in eating phase (fasting completed)
 * - DiscardedPeriod: Period hasn't started yet
 */
export type CancellationResult = Data.TaggedEnum<{
  CompletedPeriod: { readonly fastingStartDate: Date; readonly fastingEndDate: Date };
  PartialFastingPeriod: {
    readonly fastingStartDate: Date;
    readonly fastingEndDate: Date;
    readonly originalFastingEndDate: Date;
  };
  CompletedFastingInEatingPhase: {
    readonly fastingStartDate: Date;
    readonly fastingEndDate: Date;
  };
  DiscardedPeriod: {};
}>;
export const CancellationResult = Data.taggedEnum<CancellationResult>();
export const { $is: isCancellationResult, $match: matchCancellationResult } = CancellationResult;

/**
 * PeriodPhase - Computed assessment of where a period currently is.
 * Determined by comparing period dates against current time.
 * Uses raw `number` (ms) for durations since branded Duration type is not yet shared.
 */
export type PeriodPhase = Data.TaggedEnum<{
  Scheduled: { readonly startsInMs: number };
  Fasting: { readonly elapsedMs: number; readonly remainingMs: number; readonly percentage: number };
  Eating: { readonly fastingCompletedMs: number; readonly eatingElapsedMs: number; readonly eatingRemainingMs: number };
  Completed: { readonly fastingDurationMs: number; readonly eatingDurationMs: number };
}>;
export const PeriodPhase = Data.taggedEnum<PeriodPhase>();
export const { $is: isPeriodPhase, $match: matchPeriodPhase } = PeriodPhase;

/**
 * PlanProgress - Overall assessment of plan progress.
 * Aggregates period phases into a plan-level view.
 */
export type PlanProgress = Data.TaggedEnum<{
  NotStarted: { readonly startsInMs: number; readonly totalPeriods: number };
  InProgress: {
    readonly currentPeriodIndex: number;
    readonly totalPeriods: number;
    readonly completedPeriods: number;
    readonly currentPeriodPhase: PeriodPhase;
  };
  AllPeriodsCompleted: { readonly totalPeriods: number; readonly totalFastingTimeMs: number };
}>;
export const PlanProgress = Data.taggedEnum<PlanProgress>();
export const { $is: isPlanProgress, $match: matchPlanProgress } = PlanProgress;
