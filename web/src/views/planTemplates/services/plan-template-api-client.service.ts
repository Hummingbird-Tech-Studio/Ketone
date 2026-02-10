/**
 * PlanTemplate API Client Service
 *
 * IMPERATIVE SHELL — HTTP + boundary mappers (DTO → domain types)
 *
 * This is the web equivalent of the repository layer. All methods return
 * domain types, never raw DTOs. Boundary mappers are applied at the API client
 * boundary. HTTP errors are mapped to domain-tagged errors.
 *
 * Three Phases pattern:
 *   - Collection: Gateway fetches from API (THIS FILE)
 *   - Logic: FC pure functions (domain/services/)
 *   - Persistence: Gateway writes to API (THIS FILE)
 */
import {
  handleServerErrorResponse,
  handleUnauthorizedResponse,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
  HttpClientWith401Interceptor,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import {
  type PlanTemplateResponse,
  PlanTemplatesListResponseSchema,
  type PlanTemplateWithPeriodsResponse,
  PlanTemplateWithPeriodsResponseSchema,
} from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';
import { TemplateLimitReachedError, TemplateNotFoundError, TemplateServiceError } from '../domain/errors';
import {
  EatingWindow,
  FastingDuration,
  PeriodCount,
  PeriodOrder,
  PlanDescription,
  PlanName,
  type PlanTemplateDetail,
  PlanTemplateDetail as PlanTemplateDetailClass,
  type PlanTemplateId,
  type PlanTemplateSummary,
  PlanTemplateSummary as PlanTemplateSummaryClass,
  type TemplatePeriodConfig,
  TemplatePeriodConfig as TemplatePeriodConfigClass,
} from '../domain/plan-template.model';

// ============================================================================
// Boundary Mappers — DTO ↔ Domain
// ============================================================================

/**
 * Map a single API DTO to a PlanTemplateSummary domain type.
 * Branded types are applied during mapping.
 */
const fromTemplateResponse = (dto: PlanTemplateResponse): PlanTemplateSummary =>
  new PlanTemplateSummaryClass({
    id: dto.id as PlanTemplateId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    periodCount: PeriodCount(dto.periodCount),
    updatedAt: dto.updatedAt,
  });

/**
 * Map an API DTO array to PlanTemplateSummary[] domain types.
 */
const fromTemplateListResponse = (dtos: ReadonlyArray<PlanTemplateResponse>): ReadonlyArray<PlanTemplateSummary> =>
  dtos.map(fromTemplateResponse);

/**
 * Map a period config DTO to a TemplatePeriodConfig domain type.
 */
const fromPeriodConfigResponse = (dto: {
  order: number;
  fastingDuration: number;
  eatingWindow: number;
}): TemplatePeriodConfig =>
  new TemplatePeriodConfigClass({
    order: PeriodOrder(dto.order),
    fastingDuration: FastingDuration(dto.fastingDuration),
    eatingWindow: EatingWindow(dto.eatingWindow),
  });

/**
 * Map an API DTO with periods to a PlanTemplateDetail domain type.
 */
const fromTemplateDetailResponse = (dto: PlanTemplateWithPeriodsResponse): PlanTemplateDetail =>
  new PlanTemplateDetailClass({
    id: dto.id as PlanTemplateId,
    name: PlanName(dto.name),
    description: dto.description !== null ? PlanDescription(dto.description) : null,
    periodCount: PeriodCount(dto.periodCount),
    periods: dto.periods.map(fromPeriodConfigResponse),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });

/**
 * Map domain update input to API PATCH payload.
 * Pure function — always succeeds.
 */
const toUpdatePayload = (input: {
  name: string;
  description: string | null;
  periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
}) => ({
  name: input.name,
  description: input.description,
  periods: input.periods.map((p) => ({
    fastingDuration: p.fastingDuration,
    eatingWindow: p.eatingWindow,
  })),
});

// ============================================================================
// Error Response Schema
// ============================================================================

const TemplateApiErrorResponseSchema = S.Struct({
  _tag: S.optional(S.String),
  message: S.optional(S.String),
  planTemplateId: S.optional(S.String),
  currentCount: S.optional(S.Number),
  maxTemplates: S.optional(S.Number),
});

const ErrorResponseSchema = S.Struct({
  message: S.optional(S.String),
});

// ============================================================================
// Response Type Aliases
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
// Response Handlers
// ============================================================================

const handleNotFoundResponse = (response: HttpClientResponse.HttpClientResponse, planTemplateId: string) =>
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

const handleLimitReachedResponse = (response: HttpClientResponse.HttpClientResponse) =>
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

/**
 * Handle list templates response — 200 OK → PlanTemplateSummary[]
 */
const handleListTemplatesResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ReadonlyArray<PlanTemplateSummary>, ListTemplatesError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanTemplatesListResponseSchema)(response).pipe(
        Effect.map(fromTemplateListResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle get template response — 200 OK → PlanTemplateDetail
 */
const handleGetTemplateResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planTemplateId: string,
): Effect.Effect<PlanTemplateDetail, GetTemplateError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanTemplateWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromTemplateDetailResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () => handleNotFoundResponse(response, planTemplateId)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle create from plan response — 201 Created → PlanTemplateDetail
 */
const handleCreateFromPlanResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<PlanTemplateDetail, CreateFromPlanError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(PlanTemplateWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromTemplateDetailResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Conflict, () => handleLimitReachedResponse(response)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle update template response — 200 OK → PlanTemplateDetail
 */
const handleUpdateTemplateResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planTemplateId: string,
): Effect.Effect<PlanTemplateDetail, UpdateTemplateError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanTemplateWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromTemplateDetailResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () => handleNotFoundResponse(response, planTemplateId)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle delete template response — 204 No Content → void
 */
const handleDeleteTemplateResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planTemplateId: string,
): Effect.Effect<void, DeleteTemplateError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.NoContent, () => Effect.void),
    Match.when(HttpStatus.NotFound, () => handleNotFoundResponse(response, planTemplateId)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle duplicate template response — 201 Created → PlanTemplateDetail
 */
const handleDuplicateTemplateResponse = (
  response: HttpClientResponse.HttpClientResponse,
  planTemplateId: string,
): Effect.Effect<PlanTemplateDetail, DuplicateTemplateError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(PlanTemplateWithPeriodsResponseSchema)(response).pipe(
        Effect.map(fromTemplateDetailResponse),
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.NotFound, () => handleNotFoundResponse(response, planTemplateId)),
    Match.when(HttpStatus.Conflict, () => handleLimitReachedResponse(response)),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

// ============================================================================
// API Client Service — Effect.Service
// ============================================================================

export class PlanTemplateApiClientService extends Effect.Service<PlanTemplateApiClientService>()(
  'PlanTemplateApiClientService',
  {
    effect: Effect.gen(function* () {
      const authenticatedClient = yield* AuthenticatedHttpClient;

      return {
        /**
         * List all plan templates for the authenticated user.
         * Returns domain PlanTemplateSummary[], never raw DTOs.
         */
        listTemplates: (): Effect.Effect<ReadonlyArray<PlanTemplateSummary>, ListTemplatesError> =>
          authenticatedClient
            .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plan-templates`))
            .pipe(Effect.scoped, Effect.flatMap(handleListTemplatesResponse)),

        /**
         * Get a single plan template with its period configs.
         * Returns domain PlanTemplateDetail, never raw DTO.
         */
        getTemplate: (id: PlanTemplateId): Effect.Effect<PlanTemplateDetail, GetTemplateError> =>
          authenticatedClient.execute(HttpClientRequest.get(`${API_BASE_URL}/v1/plan-templates/${id}`)).pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleGetTemplateResponse(response, id)),
          ),

        /**
         * Create a new template from an existing plan.
         * Sends planId to API, returns the created PlanTemplateDetail.
         */
        createFromPlan: (planId: string): Effect.Effect<PlanTemplateDetail, CreateFromPlanError> =>
          HttpClientRequest.post(`${API_BASE_URL}/v1/plan-templates`).pipe(
            HttpClientRequest.bodyJson({ planId }),
            Effect.flatMap((request) => authenticatedClient.execute(request)),
            Effect.scoped,
            Effect.flatMap(handleCreateFromPlanResponse),
          ),

        /**
         * Update a template's name, description, and periods.
         * Returns the updated PlanTemplateDetail.
         */
        updateTemplate: (
          id: PlanTemplateId,
          input: {
            name: string;
            description: string | null;
            periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
          },
        ): Effect.Effect<PlanTemplateDetail, UpdateTemplateError> =>
          HttpClientRequest.patch(`${API_BASE_URL}/v1/plan-templates/${id}`).pipe(
            HttpClientRequest.bodyJson(toUpdatePayload(input)),
            Effect.flatMap((request) => authenticatedClient.execute(request)),
            Effect.scoped,
            Effect.flatMap((response) => handleUpdateTemplateResponse(response, id)),
          ),

        /**
         * Delete a plan template.
         */
        deleteTemplate: (id: PlanTemplateId): Effect.Effect<void, DeleteTemplateError> =>
          authenticatedClient.execute(HttpClientRequest.del(`${API_BASE_URL}/v1/plan-templates/${id}`)).pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleDeleteTemplateResponse(response, id)),
          ),

        /**
         * Duplicate a plan template.
         * Returns the newly created PlanTemplateDetail.
         */
        duplicateTemplate: (id: PlanTemplateId): Effect.Effect<PlanTemplateDetail, DuplicateTemplateError> =>
          authenticatedClient.execute(HttpClientRequest.post(`${API_BASE_URL}/v1/plan-templates/${id}/duplicate`)).pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleDuplicateTemplateResponse(response, id)),
          ),
      };
    }),
    dependencies: [AuthenticatedHttpClient.Default],
    accessors: true,
  },
) {}

// ============================================================================
// Live Layer
// ============================================================================

export const PlanTemplateApiClientServiceLive = PlanTemplateApiClientService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);
