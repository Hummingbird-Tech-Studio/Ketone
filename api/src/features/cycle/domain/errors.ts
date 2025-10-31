import { Data } from 'effect';

export class CycleActorError extends Data.TaggedError('CycleActorError')<{
  message: string;
  cause?: unknown;
}> {}

export class CycleAlreadyInProgressError extends Data.TaggedError('CycleAlreadyInProgressError')<{
  message: string;
  userId: string;
}> {}

export class CycleIdMismatchError extends Data.TaggedError('CycleIdMismatchError')<{
  message: string;
  requestedCycleId: string;
  activeCycleId: string;
}> {}

export class CycleInvalidStateError extends Data.TaggedError('CycleInvalidStateError')<{
  message: string;
  currentState: string;
  expectedState: string;
}> {}
