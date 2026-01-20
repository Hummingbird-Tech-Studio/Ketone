import { Effect, Option } from 'effect';
import { SqlClient, SqlError } from '@effect/sql';
import {
  type PeriodData,
  type PeriodRecord,
  type PlanRecord,
  PlanRepository,
  PlanRepositoryError,
  type PlanWithPeriodsRecord,
} from '../repositories';
import {
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  NoActivePlanError,
  PeriodCompletedError,
  PeriodCountMismatchError,
  PeriodNotFoundError,
  PeriodsNotContiguousError,
  PlanActorCacheError,
  PlanAlreadyActiveError,
  PlanInvalidStateError,
  PlanNotFoundError,
  PlanOverlapError,
} from '../domain';
import { type PeriodInput, type PeriodUpdateInput } from '../api';
import { CycleRepository, CycleRepositoryError } from '../../cycle/repositories';
import { PlanActorCache } from './plan-actor-cache.service';

const ONE_HOUR_MS = 3600000;

// Validation constants
const MIN_PERIODS = 1;
const MAX_PERIODS = 31;

/**
 * Generate a UUID v4.
 */
const generateUUID = (): string => crypto.randomUUID();

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

/**
 * Create a full PlanWithPeriodsRecord from plan data and period data.
 */
const createPlanRecord = (userId: string, startDate: Date, periods: PeriodData[]): PlanWithPeriodsRecord => {
  const now = new Date();
  const planId = generateUUID();

  return {
    id: planId,
    userId,
    startDate,
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
    periods: periods.map((period) => ({
      id: generateUUID(),
      planId,
      order: period.order,
      fastingDuration: period.fastingDuration,
      eatingWindow: period.eatingWindow,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      createdAt: now,
      updatedAt: now,
    })),
  };
};

export class PlanService extends Effect.Service<PlanService>()('PlanService', {
  effect: Effect.gen(function* () {
    const planRepository = yield* PlanRepository;
    const cycleRepository = yield* CycleRepository;
    const planActorCache = yield* PlanActorCache;
    const sql = yield* SqlClient.SqlClient;

    /**
     * Internal: Materialize fasting cycles from plan periods WITHOUT transaction wrapper.
     * Used within existing transactions (completePlan, cancelPlan).
     * Creates a Completed cycle record for each period's fasting phase.
     */
    const materializeCyclesFromPeriodsNoTx = (
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

    /**
     * Complete a plan: materialize cycles and persist to PostgreSQL.
     * All database operations are wrapped in a transaction for atomicity.
     */
    const completePlan = (
      plan: PlanWithPeriodsRecord,
    ): Effect.Effect<
      PlanWithPeriodsRecord,
      PlanRepositoryError | PlanAlreadyActiveError | CycleRepositoryError | PlanActorCacheError | SqlError.SqlError
    > =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Completing plan ${plan.id}`);

        // Update plan status to completed
        const completedPlan: PlanWithPeriodsRecord = {
          ...plan,
          status: 'completed' as const,
          updatedAt: new Date(),
        };

        // ATOMIC: Materialize cycles + persist plan in a single transaction
        yield* Effect.gen(function* () {
          // Materialize cycles for all periods
          yield* materializeCyclesFromPeriodsNoTx(plan.userId, plan.periods);

          // Persist to PostgreSQL
          yield* planRepository.persistCompletedPlan(completedPlan);
        }).pipe(sql.withTransaction);

        // Remove from cache (after successful transaction)
        yield* planActorCache.removeActivePlan(plan.userId);

        yield* Effect.logInfo(`Plan ${plan.id} completed and persisted to database`);

        return completedPlan;
      }).pipe(Effect.annotateLogs({ service: 'PlanService' }));

    return {
      /**
       * Create a new plan with periods.
       * Calculates period dates consecutively starting from the plan's start date.
       * Stores in cache (KeyValueStore + memory) - NOT in PostgreSQL.
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
        | PlanOverlapError
        | PlanActorCacheError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Creating new plan');

          // Validate period count
          if (periods.length < MIN_PERIODS || periods.length > MAX_PERIODS) {
            return yield* Effect.fail(
              new InvalidPeriodCountError({
                message: `Plan must have between ${MIN_PERIODS} and ${MAX_PERIODS} periods, got ${periods.length}`,
                periodCount: periods.length,
                minPeriods: MIN_PERIODS,
                maxPeriods: MAX_PERIODS,
              }),
            );
          }

          // Check if user has an active standalone cycle (in PostgreSQL)
          const { hasActiveCycle } = yield* planRepository.hasActivePlanOrCycle(userId);
          if (hasActiveCycle) {
            return yield* Effect.fail(
              new ActiveCycleExistsError({
                message: 'Cannot create plan while user has an active standalone cycle',
                userId,
              }),
            );
          }

          // Note: startDate can be in the past for retroactive planning.
          // Overlap validation with completed cycles prevents data conflicts.
          const periodData = calculatePeriodDates(startDate, periods);

          // Check for overlap with completed cycles (OV-02)
          const firstPeriod = periodData[0];
          const lastPeriod = periodData[periodData.length - 1];

          if (firstPeriod && lastPeriod) {
            const hasOverlap = yield* planRepository.hasOverlappingCycles(
              userId,
              firstPeriod.startDate,
              lastPeriod.endDate,
            );

            if (hasOverlap) {
              return yield* Effect.fail(
                new PlanOverlapError({
                  message: 'Plan periods overlap with existing completed fasting cycles',
                  userId,
                  overlapStartDate: firstPeriod.startDate,
                  overlapEndDate: lastPeriod.endDate,
                }),
              );
            }
          }

          // Create plan record
          const plan = createPlanRecord(userId, startDate, periodData);

          // ATOMIC: Store in cache (KeyValueStore + memory) - fails if plan already exists
          // This prevents race conditions where two concurrent requests could both pass
          // validation before either writes.
          const existingPlanOption = yield* planActorCache.setActivePlanIfAbsent(userId, plan);

          if (Option.isSome(existingPlanOption)) {
            return yield* Effect.fail(
              new PlanAlreadyActiveError({
                message: 'User already has an active plan',
                userId,
              }),
            );
          }

          yield* Effect.logInfo(`Plan created successfully with ID: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get the active plan for a user with all periods.
       * On-demand completion: if all periods have ended, materializes cycles and marks plan as completed.
       */
      getActivePlanWithPeriods: (
        userId: string,
      ): Effect.Effect<
        PlanWithPeriodsRecord,
        | PlanRepositoryError
        | NoActivePlanError
        | CycleRepositoryError
        | PlanAlreadyActiveError
        | PlanActorCacheError
        | SqlError.SqlError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting active plan with periods');

          // Get from cache
          const planOption = yield* planActorCache.getActivePlan(userId);

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
            yield* Effect.logInfo(`All periods ended for plan ${plan.id}, completing plan`);

            // Complete the plan (materialize cycles, persist to PostgreSQL, remove from cache)
            return yield* completePlan(plan);
          }

          yield* Effect.logInfo(`Active plan retrieved: ${plan.id}`);

          return plan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get a specific plan by ID with all periods.
       * First checks cache, then falls back to PostgreSQL for historical plans.
       */
      getPlanWithPeriods: (
        userId: string,
        planId: string,
      ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | PlanNotFoundError | PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Getting plan ${planId} with periods`);

          // Check cache first
          const cachedPlanOption = yield* planActorCache.getActivePlan(userId);

          if (Option.isSome(cachedPlanOption) && cachedPlanOption.value.id === planId) {
            yield* Effect.logInfo(`Plan retrieved from cache: ${planId}`);
            return cachedPlanOption.value;
          }

          // Fall back to PostgreSQL for historical plans
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

          yield* Effect.logInfo(`Plan retrieved from database: ${planOption.value.id}`);

          return planOption.value;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Get all plans for a user (without periods).
       * Returns plans from PostgreSQL (historical) and includes active plan from cache.
       */
      getAllPlans: (userId: string): Effect.Effect<PlanRecord[], PlanRepositoryError | PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Getting all plans');

          // Get historical plans from PostgreSQL
          const dbPlans = yield* planRepository.getAllPlans(userId);

          // Get active plan from cache
          const activePlanOption = yield* planActorCache.getActivePlan(userId);

          // Combine: active plan (if exists) + historical plans
          const allPlans: PlanRecord[] = [];

          if (Option.isSome(activePlanOption)) {
            const activePlan = activePlanOption.value;
            // Only include if not already in dbPlans (shouldn't happen but safety check)
            const existsInDb = dbPlans.some((p) => p.id === activePlan.id);
            if (!existsInDb) {
              allPlans.push({
                id: activePlan.id,
                userId: activePlan.userId,
                startDate: activePlan.startDate,
                status: activePlan.status,
                createdAt: activePlan.createdAt,
                updatedAt: activePlan.updatedAt,
              });
            }
          }

          allPlans.push(...dbPlans);

          // Sort by startDate descending
          allPlans.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

          yield* Effect.logInfo(`Retrieved ${allPlans.length} plans`);

          return allPlans;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Cancel an active plan.
       * Materializes fasting cycles for completed and in-progress periods.
       * Persists to PostgreSQL and removes from cache.
       * All database operations are wrapped in a transaction for atomicity.
       */
      cancelPlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<
        PlanRecord,
        | PlanRepositoryError
        | PlanNotFoundError
        | PlanInvalidStateError
        | CycleRepositoryError
        | PlanAlreadyActiveError
        | PlanActorCacheError
        | SqlError.SqlError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Cancelling plan ${planId}`);

          // Get plan from cache
          const planOption = yield* planActorCache.getActivePlan(userId);

          if (Option.isNone(planOption) || planOption.value.id !== planId) {
            // Plan not in cache - check PostgreSQL for historical plan
            const dbPlanOption = yield* planRepository.getPlanById(userId, planId);

            if (Option.isNone(dbPlanOption)) {
              return yield* Effect.fail(
                new PlanNotFoundError({
                  message: 'Plan not found',
                  userId,
                  planId,
                }),
              );
            }

            // Plan exists in DB but is not active (already completed/cancelled)
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot cancel a plan that is not active',
                currentState: dbPlanOption.value.status,
                expectedState: 'active',
              }),
            );
          }

          const plan = planOption.value;

          // Verify plan is active (should always be true for cached plans)
          if (plan.status !== 'active') {
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot cancel a plan that is not active',
                currentState: plan.status,
                expectedState: 'active',
              }),
            );
          }

          const now = new Date();

          // Filter periods that have started (completed or in-progress)
          const periodsToMaterialize = plan.periods.filter((p) => p.startDate <= now);

          // Update plan status to cancelled
          const cancelledPlan: PlanWithPeriodsRecord = {
            ...plan,
            status: 'cancelled' as const,
            updatedAt: now,
          };

          // ATOMIC: Materialize cycles + persist plan in a single transaction
          yield* Effect.gen(function* () {
            if (periodsToMaterialize.length > 0) {
              yield* Effect.logInfo(`Materializing ${periodsToMaterialize.length} cycles for cancelled plan ${planId}`);
              yield* materializeCyclesFromPeriodsNoTx(userId, periodsToMaterialize, now);
            }

            // Persist to PostgreSQL
            yield* planRepository.persistCompletedPlan(cancelledPlan);
          }).pipe(sql.withTransaction);

          // Remove from cache (after successful transaction)
          yield* planActorCache.removeActivePlan(userId);

          yield* Effect.logInfo(`Plan cancelled: ${plan.id}`);

          return {
            id: cancelledPlan.id,
            userId: cancelledPlan.userId,
            startDate: cancelledPlan.startDate,
            status: cancelledPlan.status,
            createdAt: cancelledPlan.createdAt,
            updatedAt: cancelledPlan.updatedAt,
          };
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

      /**
       * Delete a plan. Only non-active plans can be deleted.
       * For historical plans in PostgreSQL only.
       */
      deletePlan: (
        userId: string,
        planId: string,
      ): Effect.Effect<void, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting plan ${planId}`);

          // Check if it's the active plan in cache
          const activePlanOption = yield* planActorCache.getActivePlan(userId);

          if (Option.isSome(activePlanOption) && activePlanOption.value.id === planId) {
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot delete an active plan. Cancel it first.',
                currentState: 'active',
                expectedState: 'completed or cancelled',
              }),
            );
          }

          // Check PostgreSQL for the plan
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
       * Updates in cache (KeyValueStore + memory).
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
        | PlanActorCacheError
      > =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating periods for plan ${planId}`);

          // 1. Get plan from cache
          const planOption = yield* planActorCache.getActivePlan(userId);

          if (Option.isNone(planOption) || planOption.value.id !== planId) {
            // Plan not in cache - check PostgreSQL for historical plan
            const dbPlanOption = yield* planRepository.getPlanById(userId, planId);

            if (Option.isNone(dbPlanOption)) {
              return yield* Effect.fail(
                new PlanNotFoundError({
                  message: 'Plan not found',
                  userId,
                  planId,
                }),
              );
            }

            // Plan exists in DB but is not active (completed/cancelled)
            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot update periods of a plan that is not active',
                currentState: dbPlanOption.value.status,
                expectedState: 'active',
              }),
            );
          }

          const plan = planOption.value;

          // 2. Verify plan is active (should always be true for cached plans, but check anyway)
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

          // 4. Verify all period IDs exist in the plan and check for duplicates
          const existingPeriodIds = new Set(plan.periods.map((p) => p.id));
          const requestPeriodIds = new Set<string>();

          for (const period of periods) {
            // Check for duplicate IDs in request
            if (requestPeriodIds.has(period.id)) {
              return yield* Effect.fail(
                new PeriodNotFoundError({
                  message: `Duplicate period ID ${period.id} in request`,
                  planId,
                  periodId: period.id,
                }),
              );
            }
            requestPeriodIds.add(period.id);

            // Check if period exists in plan
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

          // 5. Verify no completed periods are being updated
          const existingPeriodsById = new Map(plan.periods.map((p) => [p.id, p]));
          for (const period of periods) {
            const existingPeriod = existingPeriodsById.get(period.id);
            if (existingPeriod?.status === 'completed') {
              return yield* Effect.fail(
                new PeriodCompletedError({
                  message: `Cannot update period ${period.id} because it is already completed`,
                  planId,
                  periodId: period.id,
                }),
              );
            }
          }

          // 6. Sort periods by startDate for contiguity check
          const sortedPeriods = [...periods].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

          // 7. Verify periods are contiguous
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

          // 8. Check for overlap with completed cycles (OV-02)
          const firstPeriod = sortedPeriods[0];
          const lastPeriod = sortedPeriods[sortedPeriods.length - 1];

          if (firstPeriod && lastPeriod) {
            const hasOverlap = yield* planRepository.hasOverlappingCycles(
              userId,
              firstPeriod.startDate,
              lastPeriod.endDate,
            );

            if (hasOverlap) {
              return yield* Effect.fail(
                new PlanOverlapError({
                  message: 'Updated periods overlap with existing completed fasting cycles',
                  userId,
                  overlapStartDate: firstPeriod.startDate,
                  overlapEndDate: lastPeriod.endDate,
                }),
              );
            }
          }

          // 9. Create updated plan with new period data
          // Note: periodMap is guaranteed to have all period IDs because we validated:
          //   - No duplicate IDs in request (step 4)
          //   - All request IDs exist in plan (step 4)
          //   - Period count matches (step 3)
          // This ensures a 1:1 correspondence between request periods and plan periods.
          const periodMap = new Map(periods.map((p) => [p.id, p]));
          const now = new Date();

          const updatedPeriods = plan.periods.map((existingPeriod) => {
            // Safe assertion: validation guarantees all plan period IDs exist in periodMap
            const update = periodMap.get(existingPeriod.id)!;

            return {
              ...existingPeriod,
              fastingDuration: update.fastingDuration,
              eatingWindow: update.eatingWindow,
              startDate: update.startDate,
              endDate: update.endDate,
              updatedAt: now,
            };
          });

          const updatedPlan: PlanWithPeriodsRecord = {
            ...plan,
            updatedAt: now,
            periods: updatedPeriods.sort((a, b) => a.order - b.order),
          };

          // 10. Update in cache
          yield* planActorCache.updateActivePlan(userId, updatedPlan);

          yield* Effect.logInfo(`Periods updated successfully for plan ${planId}`);

          return updatedPlan;
        }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
    };
  }),
  dependencies: [PlanRepository.Default, CycleRepository.Default, PlanActorCache.Default],
  accessors: true,
}) {}
