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

export class CycleInProgressError extends Data.TaggedError('CycleInProgressError')<{
  message: string;
}> {}
