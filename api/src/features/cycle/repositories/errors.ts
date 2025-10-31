import { Data } from 'effect';

export class CycleRepositoryError extends Data.TaggedError('CycleRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
