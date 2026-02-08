import { Schema as S } from 'effect';

export const TemplatePeriodConfigResponseSchema = S.Struct({
  order: S.Number,
  fastingDuration: S.Number,
  eatingWindow: S.Number,
});

export type TemplatePeriodConfigResponse = S.Schema.Type<typeof TemplatePeriodConfigResponseSchema>;

export const PlanTemplateResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.String,
  description: S.NullOr(S.String),
  periodCount: S.Number,
  createdAt: S.Date,
  updatedAt: S.Date,
  lastUsedAt: S.NullOr(S.Date),
});

export type PlanTemplateResponse = S.Schema.Type<typeof PlanTemplateResponseSchema>;

export const PlanTemplateWithPeriodsResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.String,
  description: S.NullOr(S.String),
  periodCount: S.Number,
  createdAt: S.Date,
  updatedAt: S.Date,
  lastUsedAt: S.NullOr(S.Date),
  periods: S.Array(TemplatePeriodConfigResponseSchema),
});

export type PlanTemplateWithPeriodsResponse = S.Schema.Type<typeof PlanTemplateWithPeriodsResponseSchema>;

export const PlanTemplatesListResponseSchema = S.Array(PlanTemplateResponseSchema);

export type PlanTemplatesListResponse = S.Schema.Type<typeof PlanTemplatesListResponseSchema>;
