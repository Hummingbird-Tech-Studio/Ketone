import { Data } from 'effect';

export class PlanRepositoryError extends Data.TaggedError('PlanRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}

export class PlanTemplateRepositoryError extends Data.TaggedError('PlanTemplateRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
