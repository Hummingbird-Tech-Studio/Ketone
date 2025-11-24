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

export const CycleStatisticsResponseSchema = S.Struct({
  periodStart: S.Date,
  periodEnd: S.Date,
  periodType: S.Literal('weekly', 'monthly'),
  cycles: S.Array(CycleResponseSchema),
});
