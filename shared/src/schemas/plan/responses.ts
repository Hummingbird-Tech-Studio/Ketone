import { Schema as S } from 'effect';

export const PlanStatusSchema = S.Literal('active', 'completed', 'cancelled');
export type PlanStatus = S.Schema.Type<typeof PlanStatusSchema>;

export const PeriodStatusSchema = S.Literal('scheduled', 'in_progress', 'completed');
export type PeriodStatus = S.Schema.Type<typeof PeriodStatusSchema>;

export const PeriodResponseSchema = S.Struct({
  id: S.UUID,
  planId: S.UUID,
  order: S.Number,
  fastingDuration: S.Number,
  eatingWindow: S.Number,
  startDate: S.Date,
  endDate: S.Date,
  status: PeriodStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
});

export type PeriodResponse = S.Schema.Type<typeof PeriodResponseSchema>;

export const PlanResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.Date,
  status: PlanStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
});

export type PlanResponse = S.Schema.Type<typeof PlanResponseSchema>;

export const PlanWithPeriodsResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.Date,
  status: PlanStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
  periods: S.Array(PeriodResponseSchema),
});

export type PlanWithPeriodsResponse = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;

export const PlansListResponseSchema = S.Array(PlanResponseSchema);

export type PlansListResponse = S.Schema.Type<typeof PlansListResponseSchema>;
