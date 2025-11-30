import { Data } from 'effect';

export class ProfileRepositoryError extends Data.TaggedError('ProfileRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
