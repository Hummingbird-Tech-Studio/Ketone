import { Data } from 'effect';

/**
 * Runtime Domain Errors
 *
 * These are catchable errors used with Effect.catchTags()
 * They represent business logic failures in the domain layer.
 *
 * Usage:
 *   throw new CycleActorError({ message: "..." })
 *   Effect.catchTags({ CycleActorError: (e) => handle(e) })
 */

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
