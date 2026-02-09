import { DateTime, Effect, Option } from 'effect';
import {
  ActiveCycleExistsError,
  MAX_PLAN_TEMPLATES,
  PeriodOverlapWithCycleError,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  type PlanTemplate,
  PlanTemplateApplicationDecision,
  PlanTemplateCreationDecision,
  PlanTemplateDomainService,
  PlanTemplateDuplicationDecision,
  PlanTemplateInvalidPeriodCountError,
  PlanTemplateLimitReachedError,
  PlanTemplateNotFoundError,
  PlanTemplateDeletionDecision,
  PlanTemplateUpdateDecision,
  type PlanTemplateId,
  type PlanTemplateWithPeriods,
  type PlanWithPeriods,
} from '../domain';
import { PlanRepositoryError, PlanTemplateRepository, PlanTemplateRepositoryError } from '../repositories';
import { PlanService } from './plan.service';

// ============================================================================
// Application Service Interface
//
// Defines the contract for the Plan Template orchestration layer.
// ============================================================================

export interface IPlanTemplateService {
  createFromPlan(
    userId: string,
    planId: string,
  ): Effect.Effect<
    PlanTemplateWithPeriods,
    PlanNotFoundError | PlanTemplateLimitReachedError | PlanTemplateRepositoryError
  >;

  getPlanTemplate(
    userId: string,
    planTemplateId: PlanTemplateId,
  ): Effect.Effect<PlanTemplateWithPeriods, PlanTemplateNotFoundError | PlanTemplateRepositoryError>;

  listPlanTemplates(userId: string): Effect.Effect<ReadonlyArray<PlanTemplate>, PlanTemplateRepositoryError>;

  updatePlanTemplate(
    userId: string,
    planTemplateId: PlanTemplateId,
    updates: {
      name?: string;
      description?: string | null;
      periods?: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
    },
  ): Effect.Effect<
    PlanTemplateWithPeriods,
    PlanTemplateNotFoundError | PlanTemplateInvalidPeriodCountError | PlanTemplateRepositoryError
  >;

  deletePlanTemplate(
    userId: string,
    planTemplateId: PlanTemplateId,
  ): Effect.Effect<void, PlanTemplateNotFoundError | PlanTemplateRepositoryError>;

  duplicatePlanTemplate(
    userId: string,
    planTemplateId: PlanTemplateId,
  ): Effect.Effect<
    PlanTemplateWithPeriods,
    PlanTemplateNotFoundError | PlanTemplateLimitReachedError | PlanTemplateRepositoryError
  >;

  applyPlanTemplate(
    userId: string,
    planTemplateId: PlanTemplateId,
    startDate: Date,
  ): Effect.Effect<
    PlanWithPeriods,
    | PlanTemplateNotFoundError
    | PlanAlreadyActiveError
    | ActiveCycleExistsError
    | PeriodOverlapWithCycleError
    | PlanTemplateRepositoryError
    | PlanRepositoryError
  >;
}

export class PlanTemplateService extends Effect.Service<PlanTemplateService>()('PlanTemplateService', {
  effect: Effect.gen(function* () {
    const templateRepository = yield* PlanTemplateRepository;
    const domainService = yield* PlanTemplateDomainService;
    const planService = yield* PlanService;

    return {
      /**
       * Save an existing plan as a reusable template.
       *
       * Three Phases:
       *   Collection: planService.getPlanWithPeriods + templateRepository.countPlanTemplates
       *   Logic:      decidePlanTemplateCreation + extractTemplateFromPlan
       *   Persistence: templateRepository.createPlanTemplate
       */
      createFromPlan: (userId: string, planId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Creating plan template from plan ${planId}`);

          // Collection phase
          const planWithPeriods = yield* planService.getPlanWithPeriods(userId, planId).pipe(
            Effect.catchTag('PlanRepositoryError', (error) =>
              Effect.fail(
                new PlanTemplateRepositoryError({
                  message: 'Failed to load plan for template creation',
                  cause: error,
                }),
              ),
            ),
          );

          const currentCount = yield* templateRepository.countPlanTemplates(userId);

          // Logic phase (pure decisions)
          const creationDecision = domainService.decidePlanTemplateCreation({
            currentCount: currentCount,
            maxTemplates: MAX_PLAN_TEMPLATES,
          });

          yield* PlanTemplateCreationDecision.$match(creationDecision, {
            CanCreate: () => Effect.void,
            LimitReached: ({ currentCount, maxTemplates }) =>
              Effect.fail(
                new PlanTemplateLimitReachedError({
                  message: `Cannot create template: limit of ${maxTemplates} reached (current: ${currentCount})`,
                  currentCount,
                  maxTemplates,
                }),
              ),
          });

          const extracted = domainService.extractTemplateFromPlan(planWithPeriods);

          // Persistence phase
          return yield* templateRepository.createPlanTemplate(userId, extracted.name, extracted.description, [
            ...extracted.periods,
          ]);
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * Get a plan template with all its period configurations.
       */
      getPlanTemplate: (userId: string, planTemplateId: PlanTemplateId) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Getting plan template ${planTemplateId}`);

          const templateOption = yield* templateRepository.getPlanTemplateWithPeriods(userId, planTemplateId);

          if (Option.isNone(templateOption)) {
            return yield* Effect.fail(
              new PlanTemplateNotFoundError({
                message: 'Plan template not found',
                userId,
                planTemplateId,
              }),
            );
          }

          yield* Effect.logInfo(`Plan template retrieved: ${templateOption.value.id}`);

          return templateOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * List all plan templates for a user.
       */
      listPlanTemplates: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Listing plan templates');

          const templates = yield* templateRepository.getAllPlanTemplates(userId);

          yield* Effect.logInfo(`Retrieved ${templates.length} plan templates`);

          return templates;
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * Update a plan template and optionally replace its periods.
       *
       * Three Phases:
       *   Collection: templateRepository.getPlanTemplateWithPeriods
       *   Logic:      decidePlanTemplateUpdate (if periods provided)
       *   Persistence: templateRepository.updatePlanTemplate
       */
      updatePlanTemplate: (
        userId: string,
        planTemplateId: PlanTemplateId,
        updates: {
          name?: string;
          description?: string | null;
          periods?: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
        },
      ) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating plan template ${planTemplateId}`);

          // Collection phase
          const templateOption = yield* templateRepository.getPlanTemplateWithPeriods(userId, planTemplateId);

          if (Option.isNone(templateOption)) {
            return yield* Effect.fail(
              new PlanTemplateNotFoundError({
                message: 'Plan template not found',
                userId,
                planTemplateId,
              }),
            );
          }

          // Logic phase (pure decision)
          if (updates.periods !== undefined) {
            const updateDecision = domainService.decidePlanTemplateUpdate({
              periodCount: updates.periods.length,
            });

            yield* PlanTemplateUpdateDecision.$match(updateDecision, {
              CanUpdate: () => Effect.void,
              InvalidPeriodCount: ({ periodCount, minPeriods, maxPeriods }) =>
                Effect.fail(
                  new PlanTemplateInvalidPeriodCountError({
                    message: `Template must have between ${minPeriods} and ${maxPeriods} periods, got ${periodCount}`,
                    periodCount,
                    minPeriods,
                    maxPeriods,
                  }),
                ),
            });
          }

          // Persistence phase
          const periodsWithOrder = updates.periods ? domainService.assignPeriodOrders(updates.periods) : undefined;
          const now = yield* DateTime.nowAsDate;

          return yield* templateRepository.updatePlanTemplate(
            userId,
            planTemplateId,
            {
              name: updates.name,
              description: updates.description,
            },
            periodsWithOrder,
            now,
          );
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * Delete a plan template.
       */
      deletePlanTemplate: (userId: string, planTemplateId: PlanTemplateId) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting plan template ${planTemplateId}`);

          // Collection phase
          const templateOption = yield* templateRepository.getPlanTemplateById(userId, planTemplateId);

          const deletionDecision = domainService.decidePlanTemplateDeletion({
            planTemplateId,
            exists: Option.isSome(templateOption),
          });

          yield* PlanTemplateDeletionDecision.$match(deletionDecision, {
            CanDelete: () => Effect.void,
            TemplateNotFound: () =>
              Effect.fail(
                new PlanTemplateNotFoundError({
                  message: 'Plan template not found',
                  userId,
                  planTemplateId,
                }),
              ),
          });

          // Persistence phase
          yield* templateRepository.deletePlanTemplate(userId, planTemplateId);

          yield* Effect.logInfo(`Plan template deleted: ${planTemplateId}`);
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * Duplicate a plan template.
       *
       * Three Phases:
       *   Collection: templateRepository.getPlanTemplateWithPeriods + countPlanTemplates
       *   Logic:      decidePlanTemplateDuplication + buildDuplicateName
       *   Persistence: templateRepository.createPlanTemplate
       */
      duplicatePlanTemplate: (userId: string, planTemplateId: PlanTemplateId) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Duplicating plan template ${planTemplateId}`);

          // Collection phase
          const templateOption = yield* templateRepository.getPlanTemplateWithPeriods(userId, planTemplateId);

          if (Option.isNone(templateOption)) {
            return yield* Effect.fail(
              new PlanTemplateNotFoundError({
                message: 'Plan template not found',
                userId,
                planTemplateId,
              }),
            );
          }

          const source = templateOption.value;
          const currentCount = yield* templateRepository.countPlanTemplates(userId);

          // Logic phase (pure decisions)
          const duplicationDecision = domainService.decidePlanTemplateDuplication({
            currentCount: currentCount,
            maxTemplates: MAX_PLAN_TEMPLATES,
          });

          yield* PlanTemplateDuplicationDecision.$match(duplicationDecision, {
            CanDuplicate: () => Effect.void,
            LimitReached: ({ currentCount, maxTemplates }) =>
              Effect.fail(
                new PlanTemplateLimitReachedError({
                  message: `Cannot duplicate template: limit of ${maxTemplates} reached (current: ${currentCount})`,
                  currentCount,
                  maxTemplates,
                }),
              ),
          });

          const newName = domainService.buildDuplicateName(source.name);

          // Persistence phase
          return yield* templateRepository.createPlanTemplate(userId, newName, source.description, [...source.periods]);
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),

      /**
       * Apply a plan template to create a new active plan.
       *
       * Three Phases:
       *   Collection: templateRepository.getPlanTemplateWithPeriods
       *   Logic:      decidePlanTemplateApplication → delegate to PlanService.createPlan
       *   Persistence: PlanService handles plan creation + touchLastUsedAt
       */
      applyPlanTemplate: (userId: string, planTemplateId: PlanTemplateId, startDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Applying plan template ${planTemplateId}`);

          // Collection phase
          const templateOption = yield* templateRepository.getPlanTemplateWithPeriods(userId, planTemplateId);

          if (Option.isNone(templateOption)) {
            return yield* Effect.fail(
              new PlanTemplateNotFoundError({
                message: 'Plan template not found',
                userId,
                planTemplateId,
              }),
            );
          }

          const template = templateOption.value;

          // Logic phase (pure decision)
          const applicationDecision = domainService.decidePlanTemplateApplication({
            planTemplateId: template.id,
            startDate,
            periodConfigs: template.periods,
          });

          const periodConfigs = yield* PlanTemplateApplicationDecision.$match(applicationDecision, {
            CanApply: ({ periodConfigs }) => Effect.succeed(periodConfigs),
            EmptyTemplate: () =>
              Effect.die(`Template ${planTemplateId} has no period configurations — should be unreachable`),
          });

          // Persistence phase
          const periodInputs = [...domainService.toPeriodInputs(periodConfigs)];

          // Delegate plan creation to PlanService (handles active plan/cycle checks, period calculation)
          const plan = yield* planService
            .createPlan(userId, startDate, periodInputs, template.name as string, template.description ?? undefined)
            .pipe(
              // InvalidPeriodCountError should never occur with valid template data
              Effect.catchTag('InvalidPeriodCountError', (error) =>
                Effect.die(`Unexpected InvalidPeriodCountError from valid template: ${error.message}`),
              ),
            );

          // Touch lastUsedAt on the template
          const now = yield* DateTime.nowAsDate;
          yield* templateRepository.touchLastUsedAt(userId, planTemplateId, now).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(`Failed to update lastUsedAt for template ${planTemplateId}`, { cause: error }),
            ),
            Effect.catchTag('PlanTemplateRepositoryError', () => Effect.void),
          );

          yield* Effect.logInfo(`Plan created from template ${planTemplateId}: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanTemplateService' })),
    } satisfies IPlanTemplateService;
  }),
  dependencies: [PlanTemplateRepository.Default, PlanTemplateDomainService.Default, PlanService.Default],
  accessors: true,
}) {}
