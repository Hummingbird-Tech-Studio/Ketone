/**
 * PlanTemplate Application Service
 *
 * IMPERATIVE SHELL — Coordinates Collection → Logic → Persistence
 *
 * This service sits between XState actors and the API client + FC domain services.
 * It follows the Three Phases pattern:
 *   - Collection: Gateway fetches from API (or from caller input)
 *   - Logic: FC pure decision functions (domain/services/)
 *   - Persistence: Gateway writes to API
 *
 * Dependencies:
 *   - PlanTemplateApiClientService: HTTP + boundary mapping (Collection & Persistence)
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
  MAX_PLAN_TEMPLATES,
  PlanTemplateValidationService,
  type PlanTemplateDetail,
  type PlanTemplateId,
  type PlanTemplateSummary,
} from '@/views/planTemplates/domain';
import { Effect, Layer } from 'effect';
import type { DeleteTemplateInput, DuplicateTemplateInput, UpdateTemplateInput } from '../domain/contracts';
import { TemplateLimitReachedError } from '../domain/errors';
import {
  PlanTemplateApiClientService,
  type CreateFromPlanError,
  type DeleteTemplateError,
  type DuplicateTemplateError,
  type GetTemplateError,
  type ListTemplatesError,
  type UpdateTemplateError,
} from './plan-template-api-client.service';

// ============================================================================
// Application Service Interface
// ============================================================================

export interface IPlanTemplateApplicationService {
  listTemplates(): Effect.Effect<ReadonlyArray<PlanTemplateSummary>, ListTemplatesError>;
  getTemplate(id: PlanTemplateId): Effect.Effect<PlanTemplateDetail, GetTemplateError>;
  saveAsTemplate(
    planId: string,
  ): Effect.Effect<PlanTemplateDetail, ListTemplatesError | CreateFromPlanError | TemplateLimitReachedError>;
  duplicateTemplate(
    input: DuplicateTemplateInput,
  ): Effect.Effect<PlanTemplateDetail, DuplicateTemplateError | TemplateLimitReachedError>;
  updateTemplate(input: UpdateTemplateInput): Effect.Effect<PlanTemplateDetail, UpdateTemplateError>;
  deleteTemplate(input: DeleteTemplateInput): Effect.Effect<void, DeleteTemplateError>;
}

// ============================================================================
// Application Service — Effect.Service
// ============================================================================

export class PlanTemplateApplicationService extends Effect.Service<PlanTemplateApplicationService>()(
  'PlanTemplateApplicationService',
  {
    effect: Effect.gen(function* () {
      const gateway = yield* PlanTemplateApiClientService;
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
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),

        /**
         * Get a single plan template with its period configs.
         *
         * Collection: gateway.getTemplate(id)
         */
        getTemplate: (id: PlanTemplateId) =>
          Effect.gen(function* () {
            return yield* gateway.getTemplate(id);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),

        /**
         * Save current plan as a reusable template (full Three Phases).
         *
         * Three Phases:
         *   Collection: gateway.listTemplates() → current count
         *   Logic:      decideSaveTemplateLimit → match CanSave/LimitReached
         *   Persistence: gateway.createFromPlan(planId)
         */
        saveAsTemplate: (planId: string) =>
          Effect.gen(function* () {
            // Collection phase — fetch current template count from API
            const templates = yield* gateway.listTemplates();

            // Logic phase — FC pure decision
            const decision = validationSvc.decideSaveTemplateLimit({
              currentCount: templates.length,
              maxTemplates: MAX_PLAN_TEMPLATES,
            });

            yield* matchSaveDecision(decision, {
              CanSave: () => Effect.void,
              LimitReached: ({ currentCount, maxTemplates }) =>
                Effect.fail(
                  new TemplateLimitReachedError({
                    message: `Cannot save template: limit of ${maxTemplates} reached (current: ${currentCount})`,
                    currentCount,
                    maxTemplates,
                  }),
                ),
            });

            // Persistence phase — create template from plan
            return yield* gateway.createFromPlan(planId);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),

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
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),

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
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),

        /**
         * Delete a plan template.
         *
         * Persistence: gateway.deleteTemplate(id)
         */
        deleteTemplate: (input: DeleteTemplateInput) =>
          Effect.gen(function* () {
            yield* gateway.deleteTemplate(input.planTemplateId);
          }).pipe(Effect.annotateLogs({ service: 'PlanTemplateApplicationService' })),
      } satisfies IPlanTemplateApplicationService;
    }),
    dependencies: [PlanTemplateApiClientService.Default, PlanTemplateValidationService.Default],
    accessors: true,
  },
) {}

// ============================================================================
// Live Layer
// ============================================================================

export const PlanTemplateApplicationServiceLive = PlanTemplateApplicationService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

// ============================================================================
// Program Exports — For XState actors via runWithUi
// ============================================================================

export const programSaveAsTemplate = (planId: string) =>
  PlanTemplateApplicationService.saveAsTemplate(planId).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to save plan as template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );

export const programListTemplates = () =>
  PlanTemplateApplicationService.listTemplates().pipe(
    Effect.tapError((error) => Effect.logError('Failed to list plan templates', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );

export const programGetTemplate = (id: PlanTemplateId) =>
  PlanTemplateApplicationService.getTemplate(id).pipe(
    Effect.tapError((error) => Effect.logError('Failed to get plan template', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );

export const programDuplicateTemplate = (input: DuplicateTemplateInput) =>
  PlanTemplateApplicationService.duplicateTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to duplicate plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );

export const programUpdateTemplate = (input: UpdateTemplateInput) =>
  PlanTemplateApplicationService.updateTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );

export const programDeleteTemplate = (input: DeleteTemplateInput) =>
  PlanTemplateApplicationService.deleteTemplate(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to delete plan template', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanTemplateApplicationService' }),
    Effect.provide(PlanTemplateApplicationServiceLive),
  );
