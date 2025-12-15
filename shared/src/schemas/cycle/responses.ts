import { Schema as S } from 'effect';

export const CycleResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  status: S.Literal('InProgress', 'Completed'),
  startDate: S.Date,
  endDate: S.Date,
  notes: S.NullOr(S.String),
  createdAt: S.Date,
  updatedAt: S.Date,
});

// Schema for adjacent cycles (minimal data for validation)
export const AdjacentCycleSchema = S.Struct({
  id: S.UUID,
  startDate: S.Date,
  endDate: S.Date,
});

export type AdjacentCycle = S.Schema.Type<typeof AdjacentCycleSchema>;

// Extended schema for getCycleById with adjacent cycles for validation
export const CycleDetailResponseSchema = S.Struct({
  ...CycleResponseSchema.fields,
  // Previous completed cycle (to validate startDate >= previousCycle.endDate)
  previousCycle: S.optional(AdjacentCycleSchema),
  // Next cycle - completed or in progress (to validate endDate <= nextCycle.startDate)
  nextCycle: S.optional(AdjacentCycleSchema),
});

export type CycleDetailResponse = S.Schema.Type<typeof CycleDetailResponseSchema>;

export const ValidateOverlapResponseSchema = S.Struct({
  valid: S.Boolean,
  overlap: S.Boolean,
  lastCompletedEndDate: S.optional(S.Date),
});

export const STATISTICS_PERIOD = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
} as const;

export const PeriodTypeSchema = S.Literal(
  STATISTICS_PERIOD.WEEKLY,
  STATISTICS_PERIOD.MONTHLY
);
export type PeriodType = S.Schema.Type<typeof PeriodTypeSchema>;

// Schema for cycles in statistics with proportional duration info
export const CycleStatisticsItemSchema = S.Struct({
  ...CycleResponseSchema.fields,
  // Effective duration within the period (in milliseconds)
  effectiveDuration: S.Number,
  // Indicates if the cycle extends outside the period boundaries
  isExtended: S.Boolean,
  // Portion of the cycle before the period start (ms), undefined if none
  overflowBefore: S.optional(S.Number),
  // Portion of the cycle after the period end (ms), undefined if none
  overflowAfter: S.optional(S.Number),
  // Effective end date (for InProgress cycles, this is the current time)
  effectiveEndDate: S.Date,
});

export type CycleStatisticsItem = S.Schema.Type<typeof CycleStatisticsItemSchema>;

export const CycleStatisticsResponseSchema = S.Struct({
  periodStart: S.Date,
  periodEnd: S.Date,
  periodType: PeriodTypeSchema,
  cycles: S.Array(CycleStatisticsItemSchema),
  // Total effective duration for the period (in milliseconds)
  totalEffectiveDuration: S.Number,
});
