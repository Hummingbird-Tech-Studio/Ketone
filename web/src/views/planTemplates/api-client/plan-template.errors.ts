/**
 * PlanTemplate API Error Schemas, Type Aliases, and Error Helpers
 *
 * Defines response error schemas for parsing API error bodies,
 * composite error type aliases for each endpoint, and reusable
 * error-handling helpers.
 */
import { ServerError, UnauthorizedError, ValidationError } from '@/services/http/errors';
import { HttpClientResponse } from '@/services/http/http-client.service';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Effect, Schema as S } from 'effect';
import { TemplateLimitReachedError, TemplateNotFoundError, TemplateServiceError } from '../domain/errors';

// ============================================================================
// Error Response Schemas
// ============================================================================

export const TemplateApiErrorResponseSchema = S.Struct({
  _tag: S.optional(S.String),
  message: S.optional(S.String),
  planTemplateId: S.optional(S.String),
  currentCount: S.optional(S.Number),
  maxTemplates: S.optional(S.Number),
});

export const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

// ============================================================================
// Error Type Aliases
// ============================================================================

export type ListTemplatesError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

export type GetTemplateError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | TemplateNotFoundError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

export type CreateFromPlanError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | TemplateLimitReachedError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

export type UpdateTemplateError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | TemplateNotFoundError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

export type DeleteTemplateError =
  | HttpClientError
  | HttpBodyError
  | TemplateNotFoundError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

export type DuplicateTemplateError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | TemplateLimitReachedError
  | TemplateNotFoundError
  | TemplateServiceError
  | UnauthorizedError
  | ServerError;

// ============================================================================
// Error Helpers
// ============================================================================

export const handleNotFoundResponse = (response: HttpClientResponse.HttpClientResponse, planTemplateId: string) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(ErrorResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new TemplateNotFoundError({
              message: errorData.message ?? 'Template not found',
              planTemplateId,
            }),
          ),
        ),
      ),
    ),
  );

export const handleLimitReachedResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap((body) =>
      S.decodeUnknown(TemplateApiErrorResponseSchema)(body).pipe(
        Effect.orElseSucceed(() => ({ message: undefined, currentCount: undefined, maxTemplates: undefined })),
        Effect.flatMap((errorData) =>
          Effect.fail(
            new TemplateLimitReachedError({
              message: errorData.message ?? 'Template limit reached',
              currentCount: errorData.currentCount ?? 0,
              maxTemplates: errorData.maxTemplates ?? 20,
            }),
          ),
        ),
      ),
    ),
  );
