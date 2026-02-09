import { Schema as S } from 'effect';

// ─── Plan Template Error Schemas ────────────────────────────────────────────

export class PlanTemplateRepositoryErrorSchema extends S.TaggedError<PlanTemplateRepositoryErrorSchema>()(
  'PlanTemplateRepositoryError',
  {
    message: S.String,
  },
) {}

export class PlanTemplateNotFoundErrorSchema extends S.TaggedError<PlanTemplateNotFoundErrorSchema>()(
  'PlanTemplateNotFoundError',
  {
    message: S.String,
    userId: S.UUID,
    planTemplateId: S.UUID,
  },
) {}

export class PlanTemplateLimitReachedErrorSchema extends S.TaggedError<PlanTemplateLimitReachedErrorSchema>()(
  'PlanTemplateLimitReachedError',
  {
    message: S.String,
    currentCount: S.Number,
    maxTemplates: S.Number,
  },
) {}

export class PlanTemplateInvalidPeriodCountErrorSchema extends S.TaggedError<PlanTemplateInvalidPeriodCountErrorSchema>()(
  'PlanTemplateInvalidPeriodCountError',
  {
    message: S.String,
    periodCount: S.Number,
    minPeriods: S.Number,
    maxPeriods: S.Number,
  },
) {}

// ─── Re-exported Plan Error Schemas (used by apply endpoint) ────────────────

export {
  PlanNotFoundErrorSchema,
  PlanAlreadyActiveErrorSchema,
  ActiveCycleExistsErrorSchema,
  PeriodOverlapWithCycleErrorSchema,
  PlanRepositoryErrorSchema,
} from '../../../plan/api/schemas/errors';
