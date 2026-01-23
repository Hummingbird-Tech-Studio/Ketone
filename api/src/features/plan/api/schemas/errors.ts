import { Schema as S } from 'effect';

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
  currentState: S.String,
  expectedState: S.String,
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

export class PeriodsMismatchErrorSchema extends S.TaggedError<PeriodsMismatchErrorSchema>()('PeriodsMismatchError', {
  message: S.String,
  expectedCount: S.Number,
  receivedCount: S.Number,
}) {}

export class PeriodNotInPlanErrorSchema extends S.TaggedError<PeriodNotInPlanErrorSchema>()('PeriodNotInPlanError', {
  message: S.String,
  planId: S.UUID,
  periodId: S.UUID,
}) {}

export class PeriodsNotCompletedErrorSchema extends S.TaggedError<PeriodsNotCompletedErrorSchema>()(
  'PeriodsNotCompletedError',
  {
    message: S.String,
    planId: S.UUID,
    completedCount: S.Number,
    totalCount: S.Number,
  },
) {}
