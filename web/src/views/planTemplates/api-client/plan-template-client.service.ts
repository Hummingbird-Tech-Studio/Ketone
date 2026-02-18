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
 *   - Collection: API client fetches from API (THIS FILE)
 *   - Logic: FC pure functions (domain/services/)
 *   - Persistence: API client writes to API (THIS FILE)
 */
import { handleServerErrorResponse, handleUnauthorizedResponse, ValidationError } from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { PlanTemplateDetail, PlanTemplateId, PlanTemplateSummary } from '@/views/planTemplates/domain';
import { PlanTemplatesListResponseSchema, PlanTemplateWithPeriodsResponseSchema } from '@ketone/shared';
import { Effect, Match } from 'effect';
import {
  type CreateFromPlanError,
  type DeleteTemplateError,
  type DuplicateTemplateError,
  type GetTemplateError,
  type ListTemplatesError,
  type UpdateTemplateError,
  handleLimitReachedResponse,
  handleNotFoundResponse,
} from './plan-template.errors';
import { fromTemplateDetailResponse, fromTemplateListResponse, toUpdatePayload } from './plan-template.mappers';

// ============================================================================
// Shared Response Decoders
// ============================================================================

const decodeTemplateDetailResponse = (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(PlanTemplateWithPeriodsResponseSchema)(response).pipe(
    Effect.map(fromTemplateDetailResponse),
    Effect.mapError(
      (error) =>
        new ValidationError({
          message: 'Invalid response from server',
          issues: [error],
        }),
    ),
  );

// ============================================================================
// Response Handlers
// ============================================================================

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
    Match.when(HttpStatus.Ok, () => decodeTemplateDetailResponse(response)),
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
    Match.when(HttpStatus.Created, () => decodeTemplateDetailResponse(response)),
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
    Match.when(HttpStatus.Ok, () => decodeTemplateDetailResponse(response)),
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
    Match.when(HttpStatus.Created, () => decodeTemplateDetailResponse(response)),
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
