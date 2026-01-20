import { Effect, Option } from 'effect';
import {
  PlanRepository,
  PlanRepositoryError,
  type PeriodData,
  type PeriodRecord,
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
  PlanOverlapError,
  PeriodNotFoundError,
  PeriodCompletedError,
  PeriodsNotContiguousError,
  PeriodCountMismatchError,
} from '../domain';
import { type PeriodInput, type PeriodUpdateInput } from '../api/schemas';
import { CycleRepository, CycleRepositoryError } from '../../cycle/repositories';

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
    const planRepository = yield* PlanRepository;
    const cycleRepository = yield* CycleRepository;

    /**
     * Materialize fasting cycles from plan periods.
     * Creates a Completed cycle record for each period's fasting phase.
     */
    const materializeCyclesFromPeriods = (
      userId: string,
      periods: readonly PeriodRecord[],
      truncateTime?: Date,
    ): Effect.Effect<void, CycleRepositoryError> =>
      Effect.gen(function* () {
        const now = truncateTime ?? new Date();

        for (const period of periods) {
          const fastingEndTime = new Date(period.startDate.getTime() + period.fastingDuration * ONE_HOUR_MS);

          // Period hasn't started yet - skip
          if (period.startDate > now) {
            continue;
          }

          // Period is in fasting phase - truncate at cancellation time
          if (now < fastingEndTime) {
            yield* cycleRepository
              .createCycle({
                userId,
                status: 'Completed',
                startDate: period.startDate,
                endDate: now,
              })
              .pipe(
                // CycleAlreadyInProgressError only applies to InProgress cycles, not Completed
                Effect.catchTag('CycleAlreadyInProgressError', () =>
                  Effect.fail(
                    new CycleRepositoryError({
                      message: 'Unexpected error: CycleAlreadyInProgressError when creating Completed cycle',
                    }),
                  ),
                ),
              );
          } else {
            // Fasting phase completed - create full cycle
            yield* cycleRepository
              .createCycle({
                userId,
                status: 'Completed',
                startDate: period.startDate,
                endDate: fastingEndTime,
              })
              .pipe(
                // CycleAlreadyInProgressError only applies to InProgress cycles, not Completed
                Effect.catchTag('CycleAlreadyInProgressError', () =>
                  Effect.fail(
                    new CycleRepositoryError({
                      message: 'Unexpected error: CycleAlreadyInProgressError when creating Completed cycle',
                    }),
                  ),
                ),
              );
          }
        }
      }).pipe(Effect.annotateLogs({ service: 'PlanService' }));

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
        PlanRepositoryError | PlanAlreadyActiveError | ActiveCycleExistsError | InvalidPeriodCountError | PlanOverlapError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Creating new plan');

          const periodData = calculatePeriodDates(startDate, periods);

          const plan = yield* planRepository.createPlan(userId, startDate, periodData);

          yield* Effect.logInfo(`Plan created successfully with ID: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get the active plan for a user with all periods.
       * On-demand completion: if all periods have ended, materializes cycles and marks plan as completed.
       */
      getActivePlanWithPeriods: (
        userId: string,
      ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | NoActivePlanError | CycleRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting active plan with periods');

          const planOption = yield* planRepository.getActivePlanWithPeriods(userId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new NoActivePlanError({
                message: 'No active plan found',
                userId,
              }),
            );
          }

          const plan = planOption.value;
          const now = new Date();

          // Check if all periods have ended (on-demand completion)
          const allPeriodsEnded = plan.periods.every((p) => p.endDate <= now);

          if (allPeriodsEnded && plan.status === 'active') {
            yield* Effect.logInfo(`All periods ended for plan ${plan.id}, materializing cycles and marking as completed`);

            // Materialize cycles for all periods
            yield* materializeCyclesFromPeriods(userId, plan.periods);

            // Update plan to completed
            // These errors shouldn't happen since we verified the plan exists and is active
            yield* planRepository.updatePlanStatus(userId, plan.id, 'completed').pipe(
              Effect.catchTags({
                PlanNotFoundError: () =>
                  Effect.fail(
                    new PlanRepositoryError({
                      message: 'Unexpected error: plan not found during on-demand completion',
                    }),
                  ),
                PlanInvalidStateError: () =>
                  Effect.fail(
                    new PlanRepositoryError({
                      message: 'Unexpected error: invalid plan state during on-demand completion',
                    }),
                  ),
              }),
            );

            yield* Effect.logInfo(`Plan ${plan.id} marked as completed`);

            return {
              ...plan,
              status: 'completed' as const,
            };
          }

          yield* Effect.logInfo(`Active plan retrieved: ${plan.id}`);

          return plan;
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

          const planOption = yield* planRepository.getPlanWithPeriods(userId, planId);

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

          const plans = yield* planRepository.getAllPlans(userId);

          yield* Effect.logInfo(`Retrieved ${plans.length} plans`);

          return plans;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Cancel an active plan.
       * Materializes fasting cycles for completed and in-progress periods.
       * - Completed periods: create full fasting cycles
       * - In-progress periods: create truncated cycles (endDate = cancellation time) if still fasting
       * - Scheduled periods: discarded
       */
      cancelPlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<PlanRecord, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | CycleRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Cancelling plan ${planId}`);

          // Get plan with periods first to materialize cycles
          const planOption = yield* planRepository.getPlanWithPeriods(userId, planId);

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

          if (planWithPeriods.status !== 'active') {
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot cancel a plan that is not active',
                currentState: planWithPeriods.status,
                expectedState: 'active',
              }),
            );
          }

          const now = new Date();

          // Filter periods that have started (completed or in-progress)
          const periodsToMaterialize = planWithPeriods.periods.filter((p) => p.startDate <= now);

          if (periodsToMaterialize.length > 0) {
            yield* Effect.logInfo(`Materializing ${periodsToMaterialize.length} cycles for cancelled plan ${planId}`);
            yield* materializeCyclesFromPeriods(userId, periodsToMaterialize, now);
          }

          // Update plan status to cancelled
          const plan = yield* planRepository.updatePlanStatus(userId, planId, 'cancelled');

          yield* Effect.logInfo(`Plan cancelled: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Delete a plan. Only non-active plans can be deleted.
       */
      deletePlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<void, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting plan ${planId}`);

          const planOption = yield* planRepository.getPlanById(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const plan = planOption.value;

          if (plan.status === 'active') {
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot delete an active plan. Cancel it first.',
                currentState: plan.status,
                expectedState: 'completed or cancelled',
              }),
            );
          }

          yield* planRepository.deletePlan(userId, planId);

          yield* Effect.logInfo(`Plan deleted: ${planId}`);
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Update all periods of a plan.
       * Validates:
       * - Plan exists and is active
       * - Period count matches
       * - All period IDs exist in the plan
       * - Periods are contiguous (each period starts when previous ends)
       * - Completed periods are not modified
       * - No overlap with completed cycles (OV-02)
       */
      updatePeriods: (
        userId: string,
        planId: string,
        periods: PeriodUpdateInput[],
      ): Effect.Effect<
        PlanWithPeriodsRecord,
        | PlanRepositoryError
        | PlanNotFoundError
        | PlanInvalidStateError
        | PeriodNotFoundError
        | PeriodCompletedError
        | PeriodsNotContiguousError
        | PeriodCountMismatchError
        | PlanOverlapError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating periods for plan ${planId}`);

          // 1. Get plan with current periods
          const planOption = yield* planRepository.getPlanWithPeriods(userId, planId);

          if (Option.isNone(planOption)) {
            return yield* Effect.fail(
              new PlanNotFoundError({
                message: 'Plan not found',
                userId,
                planId,
              }),
            );
          }

          const plan = planOption.value;

          // 2. Verify plan is active
          if (plan.status !== 'active') {
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot update periods of a plan that is not active',
                currentState: plan.status,
                expectedState: 'active',
              }),
            );
          }

          // 3. Verify period count matches
          if (periods.length !== plan.periods.length) {
            return yield* Effect.fail(
              new PeriodCountMismatchError({
                message: `Period count mismatch: expected ${plan.periods.length}, got ${periods.length}`,
                expected: plan.periods.length,
                received: periods.length,
              }),
            );
          }

          // 4. Verify all period IDs exist in the plan
          const existingPeriodIds = new Set(plan.periods.map((p) => p.id));
          for (const period of periods) {
            if (!existingPeriodIds.has(period.id)) {
              return yield* Effect.fail(
                new PeriodNotFoundError({
                  message: `Period ${period.id} not found in plan`,
                  planId,
                  periodId: period.id,
                }),
              );
            }
          }

          // 5. Sort periods by startDate for contiguity check
          const sortedPeriods = [...periods].sort(
            (a, b) => a.startDate.getTime() - b.startDate.getTime(),
          );

          // 6. Verify periods are contiguous
          for (let i = 0; i < sortedPeriods.length - 1; i++) {
            const currentPeriod = sortedPeriods[i]!;
            const nextPeriod = sortedPeriods[i + 1]!;

            if (currentPeriod.endDate.getTime() !== nextPeriod.startDate.getTime()) {
              return yield* Effect.fail(
                new PeriodsNotContiguousError({
                  message: 'Periods must be contiguous: each period must start when the previous one ends',
                  planId,
                }),
              );
            }
          }

          // 7. Verify completed periods are not modified
          const existingPeriodsMap = new Map(plan.periods.map((p) => [p.id, p]));
          for (const period of periods) {
            const existingPeriod = existingPeriodsMap.get(period.id)!;

            if (existingPeriod.status === 'completed') {
              // Check if any field changed
              const hasChanges =
                period.fastingDuration !== existingPeriod.fastingDuration ||
                period.eatingWindow !== existingPeriod.eatingWindow ||
                period.startDate.getTime() !== existingPeriod.startDate.getTime() ||
                period.endDate.getTime() !== existingPeriod.endDate.getTime();

              if (hasChanges) {
                return yield* Effect.fail(
                  new PeriodCompletedError({
                    message: 'Cannot modify a completed period',
                    planId,
                    periodId: period.id,
                  }),
                );
              }
            }
          }

          // 8. Convert to repository format and update
          const periodUpdates = periods.map((p) => ({
            id: p.id,
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
            startDate: p.startDate,
            endDate: p.endDate,
          }));

          const updatedPlan = yield* planRepository.updatePeriods(userId, planId, periodUpdates);

          yield* Effect.logInfo(`Periods updated successfully for plan ${planId}`);

          return updatedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
    };
  }),
  dependencies: [PlanRepository.Default, CycleRepository.Default],
  accessors: true,
}) {}
