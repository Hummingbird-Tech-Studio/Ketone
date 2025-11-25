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

export const CycleStatisticsResponseSchema = S.Struct({
  periodStart: S.Date,
  periodEnd: S.Date,
  periodType: PeriodTypeSchema,
  cycles: S.Array(CycleResponseSchema),
});
