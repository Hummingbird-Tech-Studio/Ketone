import { PlanStatusSchema } from '@ketone/shared';
import { Schema as S } from 'effect';

// Input data schemas
export const PeriodDataSchema = S.Struct({
  order: S.Number.pipe(
    S.int({ message: () => 'Order must be an integer' }),
    S.greaterThanOrEqualTo(1, { message: () => 'Order must be at least 1' }),
    S.lessThanOrEqualTo(31, { message: () => 'Order must be at most 31' }),
  ),
  fastingDuration: S.Number.pipe(
    S.greaterThanOrEqualTo(1, { message: () => 'Fasting duration must be at least 1 hour' }),
    S.lessThanOrEqualTo(168, { message: () => 'Fasting duration must be at most 168 hours' }),
    S.filter((n) => Number.isInteger(n * 4), { message: () => 'Fasting duration must be in 15-minute increments' }),
  ),
  eatingWindow: S.Number.pipe(
    S.greaterThanOrEqualTo(1, { message: () => 'Eating window must be at least 1 hour' }),
    S.lessThanOrEqualTo(24, { message: () => 'Eating window must be at most 24 hours' }),
    S.filter((n) => Number.isInteger(n * 4), { message: () => 'Eating window must be in 15-minute increments' }),
  ),
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  fastingStartDate: S.DateFromSelf,
  fastingEndDate: S.DateFromSelf,
  eatingStartDate: S.DateFromSelf,
  eatingEndDate: S.DateFromSelf,
}).pipe(
  S.filter(
    (period) =>
      period.startDate.getTime() === period.fastingStartDate.getTime() &&
      period.fastingStartDate < period.fastingEndDate &&
      period.fastingEndDate <= period.eatingStartDate &&
      period.eatingStartDate < period.eatingEndDate &&
      period.endDate.getTime() === period.eatingEndDate.getTime(),
    {
      message: () =>
        'Period phase dates must be in chronological order with startDate=fastingStartDate and endDate=eatingEndDate',
    },
  ),
);

export const PlanDataSchema = S.Struct({
  userId: S.UUID,
  name: S.String,
  description: S.NullOr(S.String),
  startDate: S.DateFromSelf,
  status: PlanStatusSchema,
});

// Record schemas (for database results)
export const PlanRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.String,
  description: S.NullOr(S.String),
  startDate: S.DateFromSelf,
  status: PlanStatusSchema,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Schema to transform numeric strings from PostgreSQL to finite numbers
// S.JsonNumber rejects NaN and ±Infinity
const NumericFromString = S.transform(S.Union(S.JsonNumber, S.String), S.JsonNumber, {
  decode: (value) => (typeof value === 'string' ? parseFloat(value) : value),
  encode: (value) => value,
});

// DB DTO: handles format transforms only. Branded validation + phase ordering
// invariants are enforced by the Period domain entity via boundary mappers.
export const PeriodRecordSchema = S.Struct({
  id: S.UUID,
  planId: S.UUID,
  order: S.Number,
  fastingDuration: NumericFromString,
  eatingWindow: NumericFromString,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  fastingStartDate: S.DateFromSelf,
  fastingEndDate: S.DateFromSelf,
  eatingStartDate: S.DateFromSelf,
  eatingEndDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Combined schema for plan with periods
export const PlanWithPeriodsRecordSchema = S.Struct({
  ...PlanRecordSchema.fields,
  periods: S.Array(PeriodRecordSchema),
});

// ─── Plan Template Record Schemas ────────────────────────────────────────────

// DB DTO: handles format transforms only. Branded validation is enforced
// by the PlanTemplate domain entity via boundary mappers.
export const PlanTemplateRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.String,
  description: S.NullOr(S.String),
  periodCount: S.Number.pipe(S.int(), S.positive()),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
  lastUsedAt: S.NullOr(S.DateFromSelf),
});

// DB DTO: handles NumericFromString for fasting_duration and eating_window
// columns (PostgreSQL returns numeric columns as strings).
export const TemplatePeriodRecordSchema = S.Struct({
  id: S.UUID,
  planTemplateId: S.UUID,
  order: S.Number,
  fastingDuration: NumericFromString,
  eatingWindow: NumericFromString,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Type inference from schemas
export type PlanData = S.Schema.Type<typeof PlanDataSchema>;
export type PeriodData = S.Schema.Type<typeof PeriodDataSchema>;
export type PlanRecord = S.Schema.Type<typeof PlanRecordSchema>;
export type PeriodRecord = S.Schema.Type<typeof PeriodRecordSchema>;
export type PlanWithPeriodsRecord = S.Schema.Type<typeof PlanWithPeriodsRecordSchema>;
export type PlanTemplateRecord = S.Schema.Type<typeof PlanTemplateRecordSchema>;
export type TemplatePeriodRecord = S.Schema.Type<typeof TemplatePeriodRecordSchema>;
