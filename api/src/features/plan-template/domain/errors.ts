import { Data } from 'effect';

export class PlanTemplateNotFoundError extends Data.TaggedError('PlanTemplateNotFoundError')<{
  message: string;
  userId: string;
  planTemplateId: string;
}> {}

export class PlanTemplateLimitReachedError extends Data.TaggedError('PlanTemplateLimitReachedError')<{
  message: string;
  currentCount: number;
  maxTemplates: number;
}> {}

export class PlanTemplateInvalidPeriodCountError extends Data.TaggedError('PlanTemplateInvalidPeriodCountError')<{
  message: string;
  periodCount: number;
  minPeriods: number;
  maxPeriods: number;
}> {}
