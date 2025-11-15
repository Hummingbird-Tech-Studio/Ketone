import { Schema as S } from 'effect';

export class CycleRepositoryErrorSchema extends S.TaggedError<CycleRepositoryErrorSchema>()('CycleRepositoryError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}

export class CycleAlreadyInProgressErrorSchema extends S.TaggedError<CycleAlreadyInProgressErrorSchema>()(
  'CycleAlreadyInProgressError',
  {
    message: S.String,
    userId: S.String,
  },
) {}

export class CycleNotFoundErrorSchema extends S.TaggedError<CycleNotFoundErrorSchema>()('CycleNotFoundError', {
  message: S.String,
  userId: S.String,
}) {}

export class CycleIdMismatchErrorSchema extends S.TaggedError<CycleIdMismatchErrorSchema>()('CycleIdMismatchError', {
  message: S.String,
  requestedCycleId: S.String,
  activeCycleId: S.String,
}) {}

export class CycleInvalidStateErrorSchema extends S.TaggedError<CycleInvalidStateErrorSchema>()(
  'CycleInvalidStateError',
  {
    message: S.String,
    currentState: S.String,
    expectedState: S.String,
  },
) {}

export class CycleOverlapErrorSchema extends S.TaggedError<CycleOverlapErrorSchema>()('CycleOverlapError', {
  message: S.String,
  newStartDate: S.Date,
  lastCompletedEndDate: S.Date,
}) {}

export class CycleRefCacheErrorSchema extends S.TaggedError<CycleRefCacheErrorSchema>()('CycleRefCacheError', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}
