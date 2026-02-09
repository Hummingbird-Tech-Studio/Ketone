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

export class CreatePlanTemplateRequestSchema extends S.Class<CreatePlanTemplateRequestSchema>(
  'CreatePlanTemplateRequest',
)({
  planId: S.UUID,
}) {}

export class UpdatePlanTemplateRequestSchema extends S.Class<UpdatePlanTemplateRequestSchema>(
  'UpdatePlanTemplateRequest',
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
  periods: S.optional(
    S.Array(PeriodInputSchema).pipe(
      S.minItems(1, { message: () => 'Template must have at least 1 period' }),
      S.maxItems(31, { message: () => 'Template cannot have more than 31 periods' }),
    ),
  ),
}) {}

export class ApplyPlanTemplateRequestSchema extends S.Class<ApplyPlanTemplateRequestSchema>('ApplyPlanTemplateRequest')(
  {
    startDate: S.Date,
  },
) {}

export type CreatePlanTemplateRequest = S.Schema.Type<typeof CreatePlanTemplateRequestSchema>;
export type UpdatePlanTemplateRequest = S.Schema.Type<typeof UpdatePlanTemplateRequestSchema>;
export type ApplyPlanTemplateRequest = S.Schema.Type<typeof ApplyPlanTemplateRequestSchema>;
