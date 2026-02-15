/**
 * Plan Application Service
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
 *   - PlanApiClientService: HTTP + boundary mapping (Collection & Persistence)
 *   - PlanValidationService: FC pure decisions (Logic)
 */
import { extractErrorMessage } from '@/services/http/errors';
import {
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientWith401Interceptor,
} from '@/services/http/http-client.service';
import type {
  CancelPlanInput,
  CompletePlanInput,
  CreatePlanInput,
  SaveTimelineInput,
  UpdateMetadataInput,
  UpdatePeriodsInput,
} from '@/views/plan/domain';
import { Effect, Layer } from 'effect';
import {
  matchSaveTimelineDecision,
  PlanValidationService,
  type PlanDetail,
  type PlanId,
  type PlanSummary,
} from '../domain';
import {
  PlanApiClientService,
  type CancelPlanError,
  type CompletePlanError,
  type CreatePlanError,
  type GetActivePlanError,
  type GetPlanError,
  type ListPlansError,
  type UpdateMetadataError,
  type UpdatePeriodsError,
} from './plan-api-client.service';

// ============================================================================
// Application Service Interface
// ============================================================================

export interface IPlanApplicationService {
  getActivePlan(): Effect.Effect<PlanDetail, GetActivePlanError>;
  getPlan(planId: PlanId): Effect.Effect<PlanDetail, GetPlanError>;
  listPlans(): Effect.Effect<ReadonlyArray<PlanSummary>, ListPlansError>;
  createPlan(input: CreatePlanInput): Effect.Effect<PlanDetail, CreatePlanError>;
  cancelPlan(input: CancelPlanInput): Effect.Effect<PlanSummary, CancelPlanError>;
  completePlan(input: CompletePlanInput): Effect.Effect<PlanSummary, CompletePlanError>;
  updateMetadata(input: UpdateMetadataInput): Effect.Effect<PlanDetail, UpdateMetadataError>;
  updatePeriods(input: UpdatePeriodsInput): Effect.Effect<PlanDetail, UpdatePeriodsError>;
  saveTimeline(input: SaveTimelineInput): Effect.Effect<PlanDetail | null, UpdateMetadataError | UpdatePeriodsError>;
}

// ============================================================================
// Application Service — Effect.Service
// ============================================================================

export class PlanApplicationService extends Effect.Service<PlanApplicationService>()('PlanApplicationService', {
  effect: Effect.gen(function* () {
    const gateway = yield* PlanApiClientService;
    const validationSvc = yield* PlanValidationService;

    return {
      /**
       * Get the current active plan for the authenticated user.
       *
       * Collection: gateway.getActivePlan()
       * Logic: pass-through
       */
      getActivePlan: () =>
        Effect.gen(function* () {
          return yield* gateway.getActivePlan();
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Get a specific plan by ID.
       *
       * Collection: gateway.getPlan(id)
       * Logic: pass-through
       */
      getPlan: (planId: PlanId) =>
        Effect.gen(function* () {
          return yield* gateway.getPlan(planId);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * List all plans for the authenticated user.
       *
       * Collection: gateway.listPlans()
       * Logic: pass-through
       */
      listPlans: () =>
        Effect.gen(function* () {
          return yield* gateway.listPlans();
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Create a new plan with periods.
       *
       * Logic: (server validates conflicts)
       * Persistence: gateway.createPlan(input)
       */
      createPlan: (input: CreatePlanInput) =>
        Effect.gen(function* () {
          return yield* gateway.createPlan(input);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Cancel an active plan.
       *
       * Logic: (server classifies period outcomes)
       * Persistence: gateway.cancelPlan(input)
       */
      cancelPlan: (input: CancelPlanInput) =>
        Effect.gen(function* () {
          return yield* gateway.cancelPlan(input);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Complete a plan (all periods must be finished).
       *
       * Logic: (server validates all periods completed)
       * Persistence: gateway.completePlan(input)
       */
      completePlan: (input: CompletePlanInput) =>
        Effect.gen(function* () {
          return yield* gateway.completePlan(input);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Update plan metadata (name, description, startDate).
       *
       * Persistence: gateway.updatePlanMetadata(input)
       */
      updateMetadata: (input: UpdateMetadataInput) =>
        Effect.gen(function* () {
          return yield* gateway.updatePlanMetadata(input);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Update plan periods (durations).
       *
       * Persistence: gateway.updatePlanPeriods(input)
       */
      updatePeriods: (input: UpdatePeriodsInput) =>
        Effect.gen(function* () {
          return yield* gateway.updatePlanPeriods(input);
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),

      /**
       * Save timeline changes (full Three Phases with FC decision).
       *
       * Three Phases:
       *   Collection: from caller input (originalPlan, currentStartDate, currentPeriods)
       *   Logic:      decideSaveTimeline() → NoChanges / OnlyStartDate / OnlyPeriods / StartDateAndPeriods
       *   Persistence: gateway.updateMetadata + gateway.updatePlanPeriods (sequential if both)
       *
       * Returns the updated PlanDetail, or null if nothing changed.
       */
      saveTimeline: (input: SaveTimelineInput) =>
        Effect.gen(function* () {
          // Logic phase — FC pure decision
          const decision = validationSvc.decideSaveTimeline({
            originalPlan: input.originalPlan,
            currentStartDate: input.currentStartDate,
            currentPeriods: input.currentPeriods,
          });

          // Persistence phase — based on decision
          return yield* matchSaveTimelineDecision(decision, {
            NoChanges: () => Effect.succeed(null as PlanDetail | null),

            OnlyStartDate: ({ startDate }) =>
              gateway.updatePlanMetadata({
                planId: input.planId,
                startDate,
              }),

            OnlyPeriods: ({ periods }) =>
              gateway.updatePlanPeriods({
                planId: input.planId,
                periods,
              }),

            StartDateAndPeriods: ({ startDate, periods }) =>
              Effect.gen(function* () {
                // Sequential: update metadata first (start date), then periods
                yield* gateway.updatePlanMetadata({
                  planId: input.planId,
                  startDate,
                });
                return yield* gateway.updatePlanPeriods({
                  planId: input.planId,
                  periods,
                });
              }),
          });
        }).pipe(Effect.annotateLogs({ service: 'PlanApplicationService' })),
    } satisfies IPlanApplicationService;
  }),
  dependencies: [PlanApiClientService.Default, PlanValidationService.Default],
  accessors: true,
}) {}

// ============================================================================
// Live Layer
// ============================================================================

export const PlanApplicationServiceLive = PlanApplicationService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

// ============================================================================
// Program Exports — For XState actors via runWithUi
// ============================================================================

export const programGetActivePlan = () =>
  PlanApplicationService.getActivePlan().pipe(
    Effect.tapError((error) => Effect.logError('Failed to get active plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programGetPlan = (planId: PlanId) =>
  PlanApplicationService.getPlan(planId).pipe(
    Effect.tapError((error) => Effect.logError('Failed to get plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programListPlans = () =>
  PlanApplicationService.listPlans().pipe(
    Effect.tapError((error) => Effect.logError('Failed to list plans', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programCreatePlan = (input: CreatePlanInput) =>
  PlanApplicationService.createPlan(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to create plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programCancelPlan = (input: CancelPlanInput) =>
  PlanApplicationService.cancelPlan(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to cancel plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programCompletePlan = (input: CompletePlanInput) =>
  PlanApplicationService.completePlan(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to complete plan', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programUpdatePlanMetadata = (input: UpdateMetadataInput) =>
  PlanApplicationService.updateMetadata(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update plan metadata', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programUpdatePlanPeriods = (input: UpdatePeriodsInput) =>
  PlanApplicationService.updatePeriods(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to update plan periods', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

export const programSaveTimeline = (input: SaveTimelineInput) =>
  PlanApplicationService.saveTimeline(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to save timeline', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );

/**
 * Re-export from cycle service for single-entrypoint pattern.
 * Actors should import this from plan-application.service instead of cycle.service directly.
 */
export { programGetLastCompletedCycle } from '@/views/cycle/services/cycle.service';
