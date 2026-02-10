/**
 * PlanTemplate Orchestrator Service
 *
 * IMPERATIVE SHELL — Orchestrates Collection → Logic → Persistence
 *
 * This service sits between XState actors and the gateway + FC domain services.
 * It follows the same Three Phases pattern as the API orchestrator:
 *   - Collection: Gateway fetches from API (or from caller input)
 *   - Logic: FC pure decision functions (domain/services/)
 *   - Persistence: Gateway writes to API
 *
 * Dependencies:
 *   - PlanTemplateGatewayService: HTTP I/O (Collection & Persistence)
 *   - PlanTemplateValidationService: FC pure decisions (Logic)
 */
import { extractErrorMessage } from '@/services/http/errors';
import {
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientWith401Interceptor,
} from '@/services/http/http-client.service';
import {
  matchSaveDecision,
  PlanTemplateValidationService,
  type PlanTemplateDetail,
  type PlanTemplateId,
  type PlanTemplateSummary,
} from '@/views/planTemplates/domain';
import { Effect, Layer } from 'effect';
import type {
  CreateFromPlanInput,
  DeleteTemplateInput,
  DuplicateTemplateInput,
  UpdateTemplateInput,
} from '../domain/contracts';
import { TemplateLimitReachedError } from '../domain/errors';
import {
  PlanTemplateGatewayService,
  type CreateFromPlanError,
  type DeleteTemplateError,
  type DuplicateTemplateError,
  type GetTemplateError,
  type ListTemplatesError,
  type UpdateTemplateError,
} from './plan-template.service';

// ============================================================================
// Orchestrator Service Interface
// ============================================================================

export interface IPlanTemplateOrchestratorService {
  listTemplates(): Effect.Effect<ReadonlyArray<PlanTemplateSummary>, ListTemplatesError>;
  getTemplate(id: PlanTemplateId): Effect.Effect<PlanTemplateDetail, GetTemplateError>;
  createFromPlan(
    input: CreateFromPlanInput,
  ): Effect.Effect<PlanTemplateDetail, CreateFromPlanError | TemplateLimitReachedError>;
  duplicateTemplate(
    input: DuplicateTemplateInput,
  ): Effect.Effect<PlanTemplateDetail, DuplicateTemplateError | TemplateLimitReachedError>;
  updateTemplate(input: UpdateTemplateInput): Effect.Effect<PlanTemplateDetail, UpdateTemplateError>;
  deleteTemplate(input: DeleteTemplateInput): Effect.Effect<void, DeleteTemplateError>;
}

// ============================================================================
// Orchestrator Service — Effect.Service
// ============================================================================

export class PlanTemplateOrchestratorService extends Effect.Service<PlanTemplateOrchestratorService>()(
  'PlanTemplateOrchestratorService',
  {
    effect: Effect.gen(function* () {
      const gateway = yield* PlanTemplateGatewayService;
      const validationSvc = yield* PlanTemplateValidationService;

      return {
        /**
         * List all plan templates for the authenticated user.
         *
         * Collection: gateway.listTemplates()
         */
        listTemplates: () =>
          Effect.gen(function* () {
            return yield* gateway.listTemplates();
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),

        /**
         * Get a single plan template with its period configs.
         *
         * Collection: gateway.getTemplate(id)
         */
        getTemplate: (id: PlanTemplateId) =>
          Effect.gen(function* () {
            return yield* gateway.getTemplate(id);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),

        /**
         * Create a new template from an existing plan.
         *
         * Three Phases:
         *   Collection: From caller (input.currentCount, input.maxTemplates)
         *   Logic:      decideSaveTemplateLimit → match CanSave/LimitReached
         *   Persistence: gateway.createFromPlan(input.planId)
         */
        createFromPlan: (input: CreateFromPlanInput) =>
          Effect.gen(function* () {
            // Logic phase (pure decision)
            const decision = validationSvc.decideSaveTemplateLimit({
              currentCount: input.currentCount,
              maxTemplates: input.maxTemplates,
            });

            yield* matchSaveDecision(decision, {
              CanSave: () => Effect.void,
              LimitReached: ({ currentCount, maxTemplates }) =>
                Effect.fail(
                  new TemplateLimitReachedError({
                    message: `Cannot create template: limit of ${maxTemplates} reached (current: ${currentCount})`,
                    currentCount,
                    maxTemplates,
                  }),
                ),
            });

            // Persistence phase
            return yield* gateway.createFromPlan(input.planId);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),

        /**
         * Duplicate a plan template.
         *
         * Three Phases:
         *   Collection: From caller (input.currentCount, input.maxTemplates)
         *   Logic:      decideSaveTemplateLimit → match CanSave/LimitReached
         *   Persistence: gateway.duplicateTemplate(input.planTemplateId)
         */
        duplicateTemplate: (input: DuplicateTemplateInput) =>
          Effect.gen(function* () {
            // Logic phase (pure decision)
            const decision = validationSvc.decideSaveTemplateLimit({
              currentCount: input.currentCount,
              maxTemplates: input.maxTemplates,
            });

            yield* matchSaveDecision(decision, {
              CanSave: () => Effect.void,
              LimitReached: ({ currentCount, maxTemplates }) =>
                Effect.fail(
                  new TemplateLimitReachedError({
                    message: `Cannot duplicate template: limit of ${maxTemplates} reached (current: ${currentCount})`,
                    currentCount,
                    maxTemplates,
                  }),
                ),
            });

            // Persistence phase
            return yield* gateway.duplicateTemplate(input.planTemplateId);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),

        /**
         * Update a template's name, description, and periods.
         *
         * Persistence: gateway.updateTemplate(id, input)
         */
        updateTemplate: (input: UpdateTemplateInput) =>
          Effect.gen(function* () {
            return yield* gateway.updateTemplate(input.planTemplateId, {
              name: input.name,
              description: input.description,
              periods: input.periods.map((p) => ({
                fastingDuration: p.fastingDuration,
                eatingWindow: p.eatingWindow,
              })),
            });
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),

        /**
         * Delete a plan template.
         *
         * Persistence: gateway.deleteTemplate(id)
         */
        deleteTemplate: (input: DeleteTemplateInput) =>
          Effect.gen(function* () {
            yield* gateway.deleteTemplate(input.planTemplateId);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' })),
      } satisfies IPlanTemplateOrchestratorService;
    }),
    dependencies: [PlanTemplateGatewayService.Default, PlanTemplateValidationService.Default],
    accessors: true,
  },
) {}

// ============================================================================
// Live Layer
// ============================================================================

export const PlanTemplateOrchestratorServiceLive = PlanTemplateOrchestratorService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

// ============================================================================
// Program Exports — For XState actors via runWithUi
// ============================================================================

export const programListTemplates = () =>
  PlanTemplateOrchestratorService.listTemplates().pipe(
    Effect.tapError((error) => Effect.logError('Failed to list plan templates', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );

export const programGetTemplate = (id: PlanTemplateId) =>
  PlanTemplateOrchestratorService.getTemplate(id).pipe(
    Effect.tapError((error) => Effect.logError('Failed to get plan template', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );

export const programCreateFromPlan = (input: CreateFromPlanInput) =>
  PlanTemplateOrchestratorService.createFromPlan(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to create template from plan', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );

export const programDuplicateTemplate = (input: DuplicateTemplateInput) =>
  PlanTemplateOrchestratorService.duplicateTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to duplicate plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );

export const programUpdateTemplate = (input: UpdateTemplateInput) =>
  PlanTemplateOrchestratorService.updateTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );

export const programDeleteTemplate = (input: DeleteTemplateInput) =>
  PlanTemplateOrchestratorService.deleteTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to delete plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateOrchestratorService' }),
    Effect.provide(PlanTemplateOrchestratorServiceLive),
  );
