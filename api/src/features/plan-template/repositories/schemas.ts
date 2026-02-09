import { Schema as S } from 'effect';

// Schema to transform numeric strings from PostgreSQL to finite numbers
// S.JsonNumber rejects NaN and ±Infinity
const NumericFromString = S.transform(S.Union(S.JsonNumber, S.String), S.JsonNumber, {
  decode: (value) => (typeof value === 'string' ? parseFloat(value) : value),
  encode: (value) => value,
});

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
export type PlanTemplateRecord = S.Schema.Type<typeof PlanTemplateRecordSchema>;
export type TemplatePeriodRecord = S.Schema.Type<typeof TemplatePeriodRecordSchema>;
