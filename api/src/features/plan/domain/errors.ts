import { Data } from 'effect';

export class PlanAlreadyActiveError extends Data.TaggedError('PlanAlreadyActiveError')<{
  message: string;
  userId: string;
}> {}

export class PlanNotFoundError extends Data.TaggedError('PlanNotFoundError')<{
  message: string;
  userId: string;
  planId: string;
}> {}

export class NoActivePlanError extends Data.TaggedError('NoActivePlanError')<{
  message: string;
  userId: string;
}> {}

export class PlanInvalidStateError extends Data.TaggedError('PlanInvalidStateError')<{
  message: string;
  currentState: string;
  expectedState: string;
}> {}

export class PeriodNotFoundError extends Data.TaggedError('PeriodNotFoundError')<{
  message: string;
  planId: string;
  periodId: string;
}> {}

export class ActiveCycleExistsError extends Data.TaggedError('ActiveCycleExistsError')<{
  message: string;
  userId: string;
}> {}

export class InvalidPeriodCountError extends Data.TaggedError('InvalidPeriodCountError')<{
  message: string;
  periodCount: number;
  minPeriods: number;
  maxPeriods: number;
}> {}

export class PlanOverlapError extends Data.TaggedError('PlanOverlapError')<{
  message: string;
  userId: string;
  overlapStartDate: Date;
  overlapEndDate: Date;
}> {}

export class PeriodCompletedError extends Data.TaggedError('PeriodCompletedError')<{
  message: string;
  planId: string;
  periodId: string;
}> {}

export class PeriodsNotContiguousError extends Data.TaggedError(
  'PeriodsNotContiguousError',
)<{
  message: string;
  planId: string;
}> {}

export class PeriodCountMismatchError extends Data.TaggedError(
  'PeriodCountMismatchError',
)<{
  message: string;
  expected: number;
  received: number;
}> {}

export class PlanActorCacheError extends Data.TaggedError('PlanActorCacheError')<{
  message: string;
  cause?: unknown;
}> {}
