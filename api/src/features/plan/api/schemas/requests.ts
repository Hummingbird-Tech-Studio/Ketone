import { Schema as S } from 'effect';

const PeriodInputSchema = S.Struct({
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
});

export class CreatePlanRequestSchema extends S.Class<CreatePlanRequestSchema>('CreatePlanRequest')({
  name: S.String.pipe(
    S.minLength(1, { message: () => 'Name is required' }),
    S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
  ),
  description: S.optional(
    S.String.pipe(S.maxLength(500, { message: () => 'Description must be at most 500 characters' })),
  ),
  startDate: S.Date,
  periods: S.Array(PeriodInputSchema).pipe(
    S.minItems(1, { message: () => 'Plan must have at least 1 period' }),
    S.maxItems(31, { message: () => 'Plan cannot have more than 31 periods' }),
  ),
}) {}

const PeriodUpdateInputSchema = S.Struct({
  id: S.optional(S.UUID),
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
});

export class UpdatePeriodsRequestSchema extends S.Class<UpdatePeriodsRequestSchema>('UpdatePeriodsRequest')({
  periods: S.Array(PeriodUpdateInputSchema).pipe(
    S.minItems(1, { message: () => 'Plan must have at least 1 period' }),
    S.maxItems(31, { message: () => 'Plan cannot have more than 31 periods' }),
  ),
}) {}

export class UpdatePlanMetadataRequestSchema extends S.Class<UpdatePlanMetadataRequestSchema>(
  'UpdatePlanMetadataRequest',
)({
  name: S.optional(
    S.String.pipe(
      S.minLength(1, { message: () => 'Name is required' }),
      S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
    ),
  ),
  description: S.optional(
    S.String.pipe(S.maxLength(500, { message: () => 'Description must be at most 500 characters' })),
  ),
  startDate: S.optional(S.Date),
}) {}

export type CreatePlanRequest = S.Schema.Type<typeof CreatePlanRequestSchema>;
export type PeriodInput = S.Schema.Type<typeof PeriodInputSchema>;
export type PeriodUpdateInput = S.Schema.Type<typeof PeriodUpdateInputSchema>;
export type UpdatePeriodsRequest = S.Schema.Type<typeof UpdatePeriodsRequestSchema>;
export type UpdatePlanMetadataRequest = S.Schema.Type<typeof UpdatePlanMetadataRequestSchema>;
