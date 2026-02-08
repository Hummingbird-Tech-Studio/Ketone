import { Schema as S } from 'effect';
import { PlanStatusSchema } from '@ketone/shared';

export class PlanRepositoryErrorSchema extends S.TaggedError<PlanRepositoryErrorSchema>()('PlanRepositoryError', {
  message: S.String,
}) {}

export class PlanAlreadyActiveErrorSchema extends S.TaggedError<PlanAlreadyActiveErrorSchema>()(
  'PlanAlreadyActiveError',
  {
    message: S.String,
    userId: S.UUID,
  },
) {}

export class PlanNotFoundErrorSchema extends S.TaggedError<PlanNotFoundErrorSchema>()('PlanNotFoundError', {
  message: S.String,
  userId: S.UUID,
  planId: S.UUID,
}) {}

export class NoActivePlanErrorSchema extends S.TaggedError<NoActivePlanErrorSchema>()('NoActivePlanError', {
  message: S.String,
  userId: S.UUID,
}) {}

export class PlanInvalidStateErrorSchema extends S.TaggedError<PlanInvalidStateErrorSchema>()('PlanInvalidStateError', {
  message: S.String,
  currentState: PlanStatusSchema,
  expectedState: PlanStatusSchema,
}) {}

export class ActiveCycleExistsErrorSchema extends S.TaggedError<ActiveCycleExistsErrorSchema>()(
  'ActiveCycleExistsError',
  {
    message: S.String,
    userId: S.UUID,
  },
) {}

export class InvalidPeriodCountErrorSchema extends S.TaggedError<InvalidPeriodCountErrorSchema>()(
  'InvalidPeriodCountError',
  {
    message: S.String,
    periodCount: S.Number,
    minPeriods: S.Number,
    maxPeriods: S.Number,
  },
) {}

export class PeriodOverlapWithCycleErrorSchema extends S.TaggedError<PeriodOverlapWithCycleErrorSchema>()(
  'PeriodOverlapWithCycleError',
  {
    message: S.String,
    userId: S.UUID,
    overlappingCycleId: S.UUID,
    cycleStartDate: S.Date,
    cycleEndDate: S.Date,
  },
) {}

export class PeriodNotInPlanErrorSchema extends S.TaggedError<PeriodNotInPlanErrorSchema>()('PeriodNotInPlanError', {
  message: S.String,
  planId: S.UUID,
  periodId: S.UUID,
}) {}

export class DuplicatePeriodIdErrorSchema extends S.TaggedError<DuplicatePeriodIdErrorSchema>()(
  'DuplicatePeriodIdError',
  {
    message: S.String,
    planId: S.UUID,
    periodId: S.UUID,
  },
) {}

export class PeriodsNotCompletedErrorSchema extends S.TaggedError<PeriodsNotCompletedErrorSchema>()(
  'PeriodsNotCompletedError',
  {
    message: S.String,
    planId: S.UUID,
    completedCount: S.Number,
    totalCount: S.Number,
  },
) {}

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
