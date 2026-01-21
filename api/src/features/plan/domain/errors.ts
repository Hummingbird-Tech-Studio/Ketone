import { Data } from 'effect';

export class PlanServiceError extends Data.TaggedError('PlanServiceError')<{
  message: string;
  cause?: unknown;
}> {}

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

export class PeriodOverlapWithCycleError extends Data.TaggedError('PeriodOverlapWithCycleError')<{
  message: string;
  userId: string;
  overlappingCycleId: string;
  cycleStartDate: Date;
  cycleEndDate: Date;
}> {}

export class PeriodsMismatchError extends Data.TaggedError('PeriodsMismatchError')<{
  message: string;
  expectedCount: number;
  receivedCount: number;
}> {}

export class PeriodNotInPlanError extends Data.TaggedError('PeriodNotInPlanError')<{
  message: string;
  planId: string;
  periodId: string;
}> {}
