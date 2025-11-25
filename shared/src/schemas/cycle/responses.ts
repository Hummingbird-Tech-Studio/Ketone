import { Schema as S } from 'effect';

export const CycleResponseSchema = S.Struct({
  id: S.String,
  userId: S.String,
  status: S.Literal('InProgress', 'Completed'),
  startDate: S.Date,
  endDate: S.Date,
  createdAt: S.Date,
  updatedAt: S.Date,
});

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
