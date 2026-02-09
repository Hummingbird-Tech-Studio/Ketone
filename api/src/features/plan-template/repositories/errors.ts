import { Data } from 'effect';

export class PlanTemplateRepositoryError extends Data.TaggedError('PlanTemplateRepositoryError')<{
  message: string;
  cause?: unknown;
}> {}
