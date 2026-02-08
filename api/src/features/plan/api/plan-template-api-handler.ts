import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { PlanTemplateService } from '../services';
import {
  PlanTemplateRepositoryErrorSchema,
  PlanTemplateNotFoundErrorSchema,
  PlanTemplateLimitReachedErrorSchema,
  PlanTemplateInvalidPeriodCountErrorSchema,
  PlanNotFoundErrorSchema,
  PlanAlreadyActiveErrorSchema,
  ActiveCycleExistsErrorSchema,
  PeriodOverlapWithCycleErrorSchema,
  PlanRepositoryErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';
import {
  PlanTemplateNotFoundError,
  PlanTemplateLimitReachedError,
  PlanTemplateInvalidPeriodCountError,
  PlanNotFoundError,
  PlanAlreadyActiveError,
  ActiveCycleExistsError,
  PeriodOverlapWithCycleError,
} from '../domain';
import { PlanTemplateRepositoryError, PlanRepositoryError } from '../repositories';

const handleTemplateRepositoryError = (error: PlanTemplateRepositoryError) =>
  Effect.gen(function* () {
    if (error.cause) {
      yield* Effect.logError('Plan template repository error cause', { cause: error.cause });
    }
    return yield* Effect.fail(
      new PlanTemplateRepositoryErrorSchema({
        message: 'A database error occurred',
      }),
    );
  });

const handlePlanRepositoryError = (error: PlanRepositoryError) =>
  Effect.gen(function* () {
    if (error.cause) {
      yield* Effect.logError('Repository error cause', { cause: error.cause });
    }
    return yield* Effect.fail(
      new PlanRepositoryErrorSchema({
        message: 'A database error occurred',
      }),
    );
  });

export const PlanTemplateApiLive = HttpApiBuilder.group(Api, 'planTemplate', (handlers) =>
  Effect.gen(function* () {
    const templateService = yield* PlanTemplateService;

    return handlers
      .handle('createPlanTemplate', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('POST /v1/plan-templates - Request received');

          const template = yield* templateService.createFromPlan(userId, payload.planId).pipe(
            Effect.tapError((error) => Effect.logError(`Error creating plan template: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
              PlanNotFoundError: (error: PlanNotFoundError) =>
                Effect.fail(
                  new PlanNotFoundErrorSchema({
                    message: error.message,
                    userId,
                    planId: error.planId,
                  }),
                ),
              PlanTemplateLimitReachedError: (error: PlanTemplateLimitReachedError) =>
                Effect.fail(
                  new PlanTemplateLimitReachedErrorSchema({
                    message: error.message,
                    currentCount: error.currentCount,
                    maxTemplates: error.maxTemplates,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan template created: ${template.id}`);

          return template;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.createPlanTemplate' })),
      )
      .handle('listPlanTemplates', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('GET /v1/plan-templates - Request received');

          const templates = yield* templateService.listPlanTemplates(userId).pipe(
            Effect.tapError((error) => Effect.logError(`Error listing plan templates: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
            }),
          );

          yield* Effect.logInfo(`Listed ${templates.length} plan templates`);

          return templates;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.listPlanTemplates' })),
      )
      .handle('getPlanTemplate', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planTemplateId = path.id;

          yield* Effect.logInfo(`GET /v1/plan-templates/${planTemplateId} - Request received`);

          const template = yield* templateService.getPlanTemplate(userId, planTemplateId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting plan template: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
              PlanTemplateNotFoundError: (error: PlanTemplateNotFoundError) =>
                Effect.fail(
                  new PlanTemplateNotFoundErrorSchema({
                    message: error.message,
                    userId,
                    planTemplateId: error.planTemplateId,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan template retrieved: ${template.id}`);

          return template;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.getPlanTemplate' })),
      )
      .handle('updatePlanTemplate', ({ path, payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planTemplateId = path.id;

          yield* Effect.logInfo(`PATCH /v1/plan-templates/${planTemplateId} - Request received`);

          const normalizedDescription =
            payload.description && payload.description.trim() !== '' ? payload.description : undefined;

          const template = yield* templateService
            .updatePlanTemplate(userId, planTemplateId, {
              name: payload.name,
              description: normalizedDescription,
              periods: payload.periods ? [...payload.periods] : undefined,
            })
            .pipe(
              Effect.tapError((error) => Effect.logError(`Error updating plan template: ${error.message}`)),
              Effect.catchTags({
                PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) =>
                  handleTemplateRepositoryError(error),
                PlanTemplateNotFoundError: (error: PlanTemplateNotFoundError) =>
                  Effect.fail(
                    new PlanTemplateNotFoundErrorSchema({
                      message: error.message,
                      userId,
                      planTemplateId: error.planTemplateId,
                    }),
                  ),
                PlanTemplateInvalidPeriodCountError: (error: PlanTemplateInvalidPeriodCountError) =>
                  Effect.fail(
                    new PlanTemplateInvalidPeriodCountErrorSchema({
                      message: error.message,
                      periodCount: error.periodCount,
                      minPeriods: error.minPeriods,
                      maxPeriods: error.maxPeriods,
                    }),
                  ),
              }),
            );

          yield* Effect.logInfo(`Plan template updated: ${template.id}`);

          return template;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.updatePlanTemplate' })),
      )
      .handle('deletePlanTemplate', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planTemplateId = path.id;

          yield* Effect.logInfo(`DELETE /v1/plan-templates/${planTemplateId} - Request received`);

          yield* templateService.deletePlanTemplate(userId, planTemplateId).pipe(
            Effect.tapError((error) => Effect.logError(`Error deleting plan template: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
              PlanTemplateNotFoundError: (error: PlanTemplateNotFoundError) =>
                Effect.fail(
                  new PlanTemplateNotFoundErrorSchema({
                    message: error.message,
                    userId,
                    planTemplateId: error.planTemplateId,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan template deleted: ${planTemplateId}`);
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.deletePlanTemplate' })),
      )
      .handle('duplicatePlanTemplate', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planTemplateId = path.id;

          yield* Effect.logInfo(`POST /v1/plan-templates/${planTemplateId}/duplicate - Request received`);

          const template = yield* templateService.duplicatePlanTemplate(userId, planTemplateId).pipe(
            Effect.tapError((error) => Effect.logError(`Error duplicating plan template: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
              PlanTemplateNotFoundError: (error: PlanTemplateNotFoundError) =>
                Effect.fail(
                  new PlanTemplateNotFoundErrorSchema({
                    message: error.message,
                    userId,
                    planTemplateId: error.planTemplateId,
                  }),
                ),
              PlanTemplateLimitReachedError: (error: PlanTemplateLimitReachedError) =>
                Effect.fail(
                  new PlanTemplateLimitReachedErrorSchema({
                    message: error.message,
                    currentCount: error.currentCount,
                    maxTemplates: error.maxTemplates,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan template duplicated: ${template.id}`);

          return template;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.duplicatePlanTemplate' })),
      )
      .handle('applyPlanTemplate', ({ path, payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planTemplateId = path.id;

          yield* Effect.logInfo(`POST /v1/plan-templates/${planTemplateId}/apply - Request received`);

          const plan = yield* templateService.applyPlanTemplate(userId, planTemplateId, payload.startDate).pipe(
            Effect.tapError((error) => Effect.logError(`Error applying plan template: ${error.message}`)),
            Effect.catchTags({
              PlanTemplateRepositoryError: (error: PlanTemplateRepositoryError) => handleTemplateRepositoryError(error),
              PlanRepositoryError: (error: PlanRepositoryError) => handlePlanRepositoryError(error),
              PlanTemplateNotFoundError: (error: PlanTemplateNotFoundError) =>
                Effect.fail(
                  new PlanTemplateNotFoundErrorSchema({
                    message: error.message,
                    userId,
                    planTemplateId: error.planTemplateId,
                  }),
                ),
              PlanAlreadyActiveError: (error: PlanAlreadyActiveError) =>
                Effect.fail(
                  new PlanAlreadyActiveErrorSchema({
                    message: error.message,
                    userId,
                  }),
                ),
              ActiveCycleExistsError: (error: ActiveCycleExistsError) =>
                Effect.fail(
                  new ActiveCycleExistsErrorSchema({
                    message: error.message,
                    userId,
                  }),
                ),
              PeriodOverlapWithCycleError: (error: PeriodOverlapWithCycleError) =>
                Effect.fail(
                  new PeriodOverlapWithCycleErrorSchema({
                    message: error.message,
                    userId,
                    overlappingCycleId: error.overlappingCycleId,
                    cycleStartDate: error.cycleStartDate,
                    cycleEndDate: error.cycleEndDate,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan created from template ${planTemplateId}: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'planTemplate.applyPlanTemplate' })),
      );
  }),
);
