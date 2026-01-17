import { Schema as S } from 'effect';

const PlanStatusSchema = S.Literal('active', 'completed', 'cancelled');
const PeriodStatusSchema = S.Literal('scheduled', 'in_progress', 'completed');

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

export const PlanResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.Date,
  status: PlanStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
});

export const PlanWithPeriodsResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.Date,
  status: PlanStatusSchema,
  createdAt: S.Date,
  updatedAt: S.Date,
  periods: S.Array(PeriodResponseSchema),
});

export const PlansListResponseSchema = S.Array(PlanResponseSchema);

export type PlanResponse = S.Schema.Type<typeof PlanResponseSchema>;
export type PlanWithPeriodsResponse = S.Schema.Type<typeof PlanWithPeriodsResponseSchema>;
export type PeriodResponse = S.Schema.Type<typeof PeriodResponseSchema>;
