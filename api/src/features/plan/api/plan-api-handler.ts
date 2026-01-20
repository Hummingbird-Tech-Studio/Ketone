import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { PlanService } from '../services';
import {
  PlanRepositoryErrorSchema,
  PlanAlreadyActiveErrorSchema,
  PlanNotFoundErrorSchema,
  NoActivePlanErrorSchema,
  PlanInvalidStateErrorSchema,
  ActiveCycleExistsErrorSchema,
  InvalidPeriodCountErrorSchema,
  PlanOverlapErrorSchema,
  PeriodNotFoundErrorSchema,
  PeriodCompletedErrorSchema,
  PeriodsNotContiguousErrorSchema,
  PeriodCountMismatchErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  NoActivePlanError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PlanOverlapError,
  PeriodNotFoundError,
  PeriodCompletedError,
  PeriodsNotContiguousError,
  PeriodCountMismatchError,
} from '../domain';
import { PlanRepositoryError } from '../repositories';
import { CycleRepositoryError } from '../../cycle';

// Helper to handle PlanRepositoryError: log cause server-side, return safe error to client
const handleRepositoryError = (error: PlanRepositoryError) =>
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

// Helper to handle CycleRepositoryError: log cause server-side, return safe error to client
const handleCycleRepositoryError = (error: CycleRepositoryError) =>
  Effect.gen(function* () {
    if (error.cause) {
      yield* Effect.logError('Cycle repository error cause', { cause: error.cause });
    }
    return yield* Effect.fail(
      new PlanRepositoryErrorSchema({
        message: 'A database error occurred',
      }),
    );
  });

// Error handler for PlanRepositoryError only
const repositoryErrorHandler = {
  PlanRepositoryError: (error: PlanRepositoryError) => handleRepositoryError(error),
};

// Error handler for getActivePlan (returns PlanRepositoryError | NoActivePlanError | CycleRepositoryError)
const noActivePlanErrorHandlers = (userId: string) => ({
  PlanRepositoryError: (error: PlanRepositoryError) => handleRepositoryError(error),
  CycleRepositoryError: (error: CycleRepositoryError) => handleCycleRepositoryError(error),
  NoActivePlanError: (error: NoActivePlanError) =>
    Effect.fail(
      new NoActivePlanErrorSchema({
        message: error.message,
        userId,
      }),
    ),
});

// Error handlers for methods that return PlanRepositoryError | PlanNotFoundError
const notFoundErrorHandlers = (userId: string) => ({
  PlanRepositoryError: (error: PlanRepositoryError) => handleRepositoryError(error),
  PlanNotFoundError: (error: PlanNotFoundError) =>
    Effect.fail(
      new PlanNotFoundErrorSchema({
        message: error.message,
        userId,
        planId: error.planId,
      }),
    ),
});

// Error handlers for deletePlan (PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError)
const deleteErrorHandlers = (userId: string) => ({
  ...notFoundErrorHandlers(userId),
  PlanInvalidStateError: (error: PlanInvalidStateError) =>
    Effect.fail(
      new PlanInvalidStateErrorSchema({
        message: error.message,
        currentState: error.currentState,
        expectedState: error.expectedState,
      }),
    ),
});

// Error handlers for cancelPlan (PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | CycleRepositoryError)
const cancelErrorHandlers = (userId: string) => ({
  ...deleteErrorHandlers(userId),
  CycleRepositoryError: (error: CycleRepositoryError) => handleCycleRepositoryError(error),
});

// Error handlers for updatePeriods
const updatePeriodsErrorHandlers = (userId: string, planId: string) => ({
  PlanRepositoryError: (error: PlanRepositoryError) => handleRepositoryError(error),
  PlanNotFoundError: (error: PlanNotFoundError) =>
    Effect.fail(
      new PlanNotFoundErrorSchema({
        message: error.message,
        userId,
        planId: error.planId,
      }),
    ),
  PlanInvalidStateError: (error: PlanInvalidStateError) =>
    Effect.fail(
      new PlanInvalidStateErrorSchema({
        message: error.message,
        currentState: error.currentState,
        expectedState: error.expectedState,
      }),
    ),
  PeriodNotFoundError: (error: PeriodNotFoundError) =>
    Effect.fail(
      new PeriodNotFoundErrorSchema({
        message: error.message,
        planId: error.planId,
        periodId: error.periodId,
      }),
    ),
  PeriodCompletedError: (error: PeriodCompletedError) =>
    Effect.fail(
      new PeriodCompletedErrorSchema({
        message: error.message,
        planId: error.planId,
        periodId: error.periodId,
      }),
    ),
  PeriodsNotContiguousError: (error: PeriodsNotContiguousError) =>
    Effect.fail(
      new PeriodsNotContiguousErrorSchema({
        message: error.message,
        planId: error.planId,
      }),
    ),
  PeriodCountMismatchError: (error: PeriodCountMismatchError) =>
    Effect.fail(
      new PeriodCountMismatchErrorSchema({
        message: error.message,
        expected: error.expected,
        received: error.received,
      }),
    ),
  PlanOverlapError: (error: PlanOverlapError) =>
    Effect.fail(
      new PlanOverlapErrorSchema({
        message: error.message,
        userId,
        overlapStartDate: error.overlapStartDate,
        overlapEndDate: error.overlapEndDate,
      }),
    ),
});

export const PlanApiLive = HttpApiBuilder.group(Api, 'plan', (handlers) =>
  Effect.gen(function* () {
    const planService = yield* PlanService;

    return handlers
      .handle('createPlan', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`POST /v1/plans - Request received for user ${userId}`);

          const plan = yield* planService.createPlan(userId, payload.startDate, [...payload.periods]).pipe(
            Effect.tapError((error) => Effect.logError(`Error creating plan: ${error.message}`)),
            Effect.catchTags({
              PlanRepositoryError: (error: PlanRepositoryError) => handleRepositoryError(error),
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
              InvalidPeriodCountError: (error: InvalidPeriodCountError) =>
                Effect.fail(
                  new InvalidPeriodCountErrorSchema({
                    message: error.message,
                    periodCount: error.periodCount,
                    minPeriods: error.minPeriods,
                    maxPeriods: error.maxPeriods,
                  }),
                ),
              PlanOverlapError: (error: PlanOverlapError) =>
                Effect.fail(
                  new PlanOverlapErrorSchema({
                    message: error.message,
                    userId,
                    overlapStartDate: error.overlapStartDate,
                    overlapEndDate: error.overlapEndDate,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Plan created successfully: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'plan.createPlan' })),
      )
      .handle('getActivePlan', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`GET /v1/plans/active - Request received for user ${userId}`);

          const plan = yield* planService.getActivePlanWithPeriods(userId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting active plan: ${error.message}`)),
            Effect.catchTags(noActivePlanErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Active plan retrieved: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'plan.getActivePlan' })),
      )
      .handle('getPlan', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planId = path.id;

          yield* Effect.logInfo(`GET /v1/plans/${planId} - Request received for user ${userId}`);

          const plan = yield* planService.getPlanWithPeriods(userId, planId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting plan: ${error.message}`)),
            Effect.catchTags(notFoundErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Plan retrieved: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'plan.getPlan' })),
      )
      .handle('listPlans', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`GET /v1/plans - Request received for user ${userId}`);

          const plans = yield* planService.getAllPlans(userId).pipe(
            Effect.tapError((error) => Effect.logError(`Error listing plans: ${error.message}`)),
            Effect.catchTags(repositoryErrorHandler),
          );

          yield* Effect.logInfo(`Listed ${plans.length} plans`);

          return plans;
        }).pipe(Effect.annotateLogs({ handler: 'plan.listPlans' })),
      )
      .handle('cancelPlan', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planId = path.id;

          yield* Effect.logInfo(`POST /v1/plans/${planId}/cancel - Request received for user ${userId}`);

          const plan = yield* planService.cancelPlan(userId, planId).pipe(
            Effect.tapError((error) => Effect.logError(`Error cancelling plan: ${error.message}`)),
            Effect.catchTags(cancelErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Plan cancelled: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'plan.cancelPlan' })),
      )
      .handle('deletePlan', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const planId = path.id;

          yield* Effect.logInfo(`DELETE /v1/plans/${planId} - Request received for user ${userId}`);

          yield* planService.deletePlan(userId, planId).pipe(
            Effect.tapError((error) => Effect.logError(`Error deleting plan: ${error.message}`)),
            Effect.catchTags(deleteErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Plan deleted: ${planId}`);
        }).pipe(Effect.annotateLogs({ handler: 'plan.deletePlan' })),
      )
      .handle('updatePeriods', ({ path, payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const { planId } = path;

          yield* Effect.logInfo(`PUT /v1/plans/${planId}/periods - Request received for user ${userId}`);

          const plan = yield* planService.updatePeriods(userId, planId, [...payload.periods]).pipe(
            Effect.tapError((error) => Effect.logError(`Error updating periods: ${error.message}`)),
            Effect.catchTags(updatePeriodsErrorHandlers(userId, planId)),
          );

          yield* Effect.logInfo(`Periods updated successfully for plan ${planId}`);

          return plan;
        }).pipe(Effect.annotateLogs({ handler: 'plan.updatePeriods' })),
      );
  }),
);
