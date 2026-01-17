import { PlanStatusSchema, PeriodStatusSchema, type PlanStatus, type PeriodStatus } from '@ketone/shared';
import { Schema as S } from 'effect';

// Re-export status schemas from shared
export { PlanStatusSchema, PeriodStatusSchema, type PlanStatus, type PeriodStatus };

// Input data schemas
export const PeriodDataSchema = S.Struct({
  order: S.Number.pipe(
    S.int({ message: () => 'Order must be an integer' }),
    S.greaterThanOrEqualTo(1, { message: () => 'Order must be at least 1' }),
    S.lessThanOrEqualTo(31, { message: () => 'Order must be at most 31' }),
  ),
  fastingDuration: S.Number.pipe(
    S.int({ message: () => 'Fasting duration must be an integer' }),
    S.greaterThanOrEqualTo(1, { message: () => 'Fasting duration must be at least 1 hour' }),
    S.lessThanOrEqualTo(168, { message: () => 'Fasting duration must be at most 168 hours' }),
  ),
  eatingWindow: S.Number.pipe(
    S.int({ message: () => 'Eating window must be an integer' }),
    S.greaterThanOrEqualTo(1, { message: () => 'Eating window must be at least 1 hour' }),
    S.lessThanOrEqualTo(24, { message: () => 'Eating window must be at most 24 hours' }),
  ),
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  status: PeriodStatusSchema,
});

export const PlanDataSchema = S.Struct({
  userId: S.UUID,
  startDate: S.DateFromSelf,
  status: PlanStatusSchema,
});

// Record schemas (for database results)
export const PlanRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  startDate: S.DateFromSelf,
  status: PlanStatusSchema,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

export const PeriodRecordSchema = S.Struct({
  id: S.UUID,
  planId: S.UUID,
  order: S.Number,
  fastingDuration: S.Number,
  eatingWindow: S.Number,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  status: PeriodStatusSchema,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Combined schema for plan with periods
export const PlanWithPeriodsRecordSchema = S.Struct({
  ...PlanRecordSchema.fields,
  periods: S.Array(PeriodRecordSchema),
});

// Type inference from schemas
export type PlanData = S.Schema.Type<typeof PlanDataSchema>;
export type PeriodData = S.Schema.Type<typeof PeriodDataSchema>;
export type PlanRecord = S.Schema.Type<typeof PlanRecordSchema>;
export type PeriodRecord = S.Schema.Type<typeof PeriodRecordSchema>;
export type PlanWithPeriodsRecord = S.Schema.Type<typeof PlanWithPeriodsRecordSchema>;
