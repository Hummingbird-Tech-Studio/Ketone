import { Data } from 'effect';

/**
 * Repository Layer Errors
 * 
 * These are infrastructure errors that occur at the persistence boundary.
 * They represent technical failures (database, network, etc.), not business rule violations.
 * 
 * Usage:
 *   throw new CycleRepositoryError({ message: "DB connection failed" })
 *   Effect.catchTags({ CycleRepositoryError: (e) => handle(e) })
 */

export class CycleRepositoryError extends Data.TaggedError('CycleRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
