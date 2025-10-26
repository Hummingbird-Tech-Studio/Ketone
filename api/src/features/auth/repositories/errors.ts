import { Data } from 'effect';

/**
 * Repository errors for database operations
 */

export class UserRepositoryError extends Data.TaggedError('UserRepositoryError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
