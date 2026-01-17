import { Schema as S } from 'effect';

const PeriodInputSchema = S.Struct({
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
});

export class CreatePlanRequestSchema extends S.Class<CreatePlanRequestSchema>('CreatePlanRequest')({
  startDate: S.Date,
  periods: S.Array(PeriodInputSchema).pipe(
    S.minItems(1, { message: () => 'Plan must have at least 1 period' }),
    S.maxItems(31, { message: () => 'Plan cannot have more than 31 periods' }),
  ),
}) {}

export type CreatePlanRequest = S.Schema.Type<typeof CreatePlanRequestSchema>;
export type PeriodInput = S.Schema.Type<typeof PeriodInputSchema>;
