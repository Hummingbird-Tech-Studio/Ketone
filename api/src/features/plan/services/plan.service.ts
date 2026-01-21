import { Effect, Option } from 'effect';
import {
  PlanRepository,
  PlanRepositoryError,
  type PeriodData,
  type PlanRecord,
  type PlanWithPeriodsRecord,
} from '../repositories';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  NoActivePlanError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PeriodOverlapWithCycleError,
  PeriodsMismatchError,
  PeriodNotInPlanError,
} from '../domain';
import { type PeriodInput } from '../api';

const ONE_HOUR_MS = 3600000;

/**
 * Calculate period dates from a start date and period inputs.
 * Periods are consecutive - each starts when the previous ends.
 */
const calculatePeriodDates = (startDate: Date, periods: PeriodInput[]): PeriodData[] => {
  let currentDate = new Date(startDate);

  return periods.map((period, index) => {
    const periodStart = new Date(currentDate);
    const totalDurationMs = (period.fastingDuration + period.eatingWindow) * ONE_HOUR_MS;
    const periodEnd = new Date(periodStart.getTime() + totalDurationMs);

    currentDate = periodEnd;

    return {
      order: index + 1,
      fastingDuration: period.fastingDuration,
      eatingWindow: period.eatingWindow,
      startDate: periodStart,
      endDate: periodEnd,
      status: 'scheduled' as const,
    };
  });
};

export class PlanService extends Effect.Service<PlanService>()('PlanService', {
  effect: Effect.gen(function* () {
    const repository = yield* PlanRepository;

    return {
      /**
       * Create a new plan with periods.
       * Calculates period dates consecutively starting from the plan's start date.
       */
      createPlan: (
        userId: string,
        startDate: Date,
        periods: PeriodInput[],
      ): Effect.Effect<
        PlanWithPeriodsRecord,
        | PlanRepositoryError
        | PlanAlreadyActiveError
        | ActiveCycleExistsError
        | InvalidPeriodCountError
        | PeriodOverlapWithCycleError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Creating new plan');

          const periodData = calculatePeriodDates(startDate, periods);

          const plan = yield* repository.createPlan(userId, startDate, periodData);

          yield* Effect.logInfo(`Plan created successfully with ID: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get the active plan for a user with all periods.
       */
      getActivePlanWithPeriods: (
        userId: string,
      ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | NoActivePlanError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting active plan with periods');

          const planOption = yield* repository.getActivePlanWithPeriods(userId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new NoActivePlanError({
                message: 'No active plan found',
                userId,
              }),
            );
          }

          yield* Effect.logInfo(`Active plan retrieved: ${planOption.value.id}`);

          return planOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get a specific plan by ID with all periods.
       */
      getPlanWithPeriods: (
        userId: string,
        planId: string,
      ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | PlanNotFoundError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Getting plan ${planId} with periods`);

          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          yield* Effect.logInfo(`Plan retrieved: ${planOption.value.id}`);

          return planOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get all plans for a user (without periods).
       */
      getAllPlans: (userId: string): Effect.Effect<PlanRecord[], PlanRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting all plans');

          const plans = yield* repository.getAllPlans(userId);

          yield* Effect.logInfo(`Retrieved ${plans.length} plans`);

          return plans;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Cancel an active plan.
       *
       * This operation is atomic - both plan cancellation and cycle preservation (if applicable)
       * happen in a single transaction. If cycle creation fails, the entire operation is rolled back.
       *
       * - Completed periods remain saved (unchanged)
       * - In-progress period: fasting cycle is saved with end_date = cancellation time
       * - Scheduled periods are discarded (plan is cancelled, they won't execute)
       */
      cancelPlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<PlanRecord, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Cancelling plan ${planId}`);

          // Get the plan with periods to check for in-progress period
          const planOption = yield* repository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const planWithPeriods = planOption.value;

          // Find in-progress period (if any)
          const inProgressPeriod = planWithPeriods.periods.find((p) => p.status === 'in_progress');
          const inProgressPeriodStartDate = inProgressPeriod?.startDate ?? null;

          if (inProgressPeriod) {
            yield* Effect.logInfo(
              `In-progress period found (ID: ${inProgressPeriod.id}). Will preserve fasting record.`,
            );
          }

          // Cancel the plan atomically with cycle preservation
          // If there's an in-progress period, both operations happen in one transaction
          const cancelledPlan = yield* repository.cancelPlanWithCyclePreservation(
            userId,
            planId,
            inProgressPeriodStartDate,
          );

          yield* Effect.logInfo(`Plan cancelled: ${cancelledPlan.id}`);

          return cancelledPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Update plan periods with new durations.
       * Recalculates period dates to maintain contiguity.
       */
      updatePlanPeriods: (
        userId: string,
        planId: string,
        periods: Array<{ id: string; fastingDuration: number; eatingWindow: number }>,
      ): Effect.Effect<
        PlanWithPeriodsRecord,
        | PlanRepositoryError
        | PlanNotFoundError
        | PeriodsMismatchError
        | PeriodNotInPlanError
        | PeriodOverlapWithCycleError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating periods for plan ${planId}`);

          const updatedPlan = yield* repository.updatePlanPeriods(userId, planId, periods);

          yield* Effect.logInfo(`Plan periods updated successfully for plan ${planId}`);

          return updatedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
    };
  }),
  dependencies: [PlanRepository.Default],
  accessors: true,
}) {}
