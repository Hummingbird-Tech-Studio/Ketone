/**
 * PlanTemplate Domain Errors
 *
 * Typed errors for domain rule violations.
 * Use Data.TaggedError for structured error handling.
 */
import { Data } from 'effect';

/**
 * TemplateLimitReachedError
 *
 * Thrown when attempting to create or duplicate a template
 * while already at the 20-template cap.
 */
export class TemplateLimitReachedError extends Data.TaggedError('TemplateLimitReachedError')<{
  readonly message: string;
  readonly currentCount: number;
  readonly maxTemplates: number;
}> {}

/**
 * TemplateNotFoundError
 *
 * Thrown when attempting to access a template that doesn't exist
 * (HTTP 404 from gateway).
 */
export class TemplateNotFoundError extends Data.TaggedError('TemplateNotFoundError')<{
  readonly message: string;
  readonly planTemplateId: string;
}> {}

/**
 * TemplateServiceError
 *
 * Generic gateway/HTTP failure when communicating with the
 * plan-template API endpoints.
 */
export class TemplateServiceError extends Data.TaggedError('TemplateServiceError')<{
  readonly message: string;
}> {}
