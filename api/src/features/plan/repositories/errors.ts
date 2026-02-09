import { Data } from 'effect';

export class PlanRepositoryError extends Data.TaggedError('PlanRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
