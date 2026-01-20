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

export class PlanOverlapErrorSchema extends S.TaggedError<PlanOverlapErrorSchema>()('PlanOverlapError', {
  message: S.String,
  userId: S.UUID,
  overlapStartDate: S.Date,
  overlapEndDate: S.Date,
}) {}

export class PeriodNotFoundErrorSchema extends S.TaggedError<PeriodNotFoundErrorSchema>()('PeriodNotFoundError', {
  message: S.String,
  planId: S.UUID,
  periodId: S.UUID,
}) {}

export class PeriodCompletedErrorSchema extends S.TaggedError<PeriodCompletedErrorSchema>()('PeriodCompletedError', {
  message: S.String,
  planId: S.UUID,
  periodId: S.UUID,
}) {}

export class PeriodsNotContiguousErrorSchema extends S.TaggedError<PeriodsNotContiguousErrorSchema>()(
  'PeriodsNotContiguousError',
  {
    message: S.String,
    planId: S.UUID,
  },
) {}

export class PeriodCountMismatchErrorSchema extends S.TaggedError<PeriodCountMismatchErrorSchema>()(
  'PeriodCountMismatchError',
  {
    message: S.String,
    expected: S.Number,
    received: S.Number,
  },
) {}
