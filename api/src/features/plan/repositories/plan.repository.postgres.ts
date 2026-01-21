import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Effect, Option, Schema as S } from 'effect';
import { plansTable, periodsTable, cyclesTable, isUniqueViolation, isExclusionViolation } from '../../../db';
import { PlanRepositoryError } from './errors';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  PeriodNotFoundError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PeriodOverlapWithCycleError,
  PeriodsMismatchError,
  PeriodNotInPlanError,
} from '../domain';
import { type PeriodData, type PlanStatus, type PeriodStatus, PlanRecordSchema, PeriodRecordSchema } from './schemas';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import type { IPlanRepository } from './plan.repository.interface';

export class PlanRepositoryPostgres extends Effect.Service<PlanRepositoryPostgres>()('PlanRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const sql = yield* SqlClient.SqlClient;

    /**
     * Helper: Get a plan by ID or fail with PlanNotFoundError.
     * Used internally to reduce code duplication in transactional methods.
     */
    const getPlanOrFail = (userId: string, planId: string) =>
      Effect.gen(function* () {
        const results = yield* drizzle
          .select()
          .from(plansTable)
          .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId)))
          .pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to get plan from database',
                  cause: error,
                }),
            ),
          );

        if (results.length === 0) {
          return yield* Effect.fail(
            new PlanNotFoundError({
              message: 'Plan not found or does not belong to user',
              userId,
              planId,
            }),
          );
        }

        return yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
          Effect.mapError(
            (error) =>
              new PlanRepositoryError({
                message: 'Failed to validate plan record from database',
                cause: error,
              }),
          ),
        );
      });

    /**
     * Helper: Check if any periods overlap with existing cycles.
     * Fails with PeriodOverlapWithCycleError if overlap is found.
     */
    const checkPeriodsOverlapWithCycles = (
      userId: string,
      periods: Array<{ startDate: Date; endDate: Date }>,
      errorMessagePrefix: string,
    ) =>
      Effect.gen(function* () {
        yield* Effect.logInfo('Checking for period overlaps with existing cycles');

        const earliestStart = periods.reduce(
          (min, p) => (p.startDate < min ? p.startDate : min),
          periods[0]!.startDate,
        );
        const latestEnd = periods.reduce((max, p) => (p.endDate > max ? p.endDate : max), periods[0]!.endDate);

        const overlappingCycles = yield* drizzle
          .select({
            id: cyclesTable.id,
            startDate: cyclesTable.startDate,
            endDate: cyclesTable.endDate,
          })
          .from(cyclesTable)
          .where(
            and(
              eq(cyclesTable.userId, userId),
              gt(cyclesTable.endDate, earliestStart),
              lt(cyclesTable.startDate, latestEnd),
            ),
          )
          .pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to check for overlapping cycles',
                  cause: error,
                }),
            ),
          );

        for (const period of periods) {
          for (const cycle of overlappingCycles) {
            if (period.endDate > cycle.startDate && period.startDate < cycle.endDate) {
              yield* Effect.logWarning(`Period overlap detected with cycle ${cycle.id}`);
              return yield* Effect.fail(
                new PeriodOverlapWithCycleError({
                  message: `${errorMessagePrefix} Found overlap with cycle from ${cycle.startDate.toISOString()} to ${cycle.endDate.toISOString()}.`,
                  userId,
                  overlappingCycleId: cycle.id,
                  cycleStartDate: cycle.startDate,
                  cycleEndDate: cycle.endDate,
                }),
              );
            }
          }
        }

        yield* Effect.logInfo('No period overlaps detected');
      });

    const repository: IPlanRepository = {
      createPlan: (userId: string, startDate: Date, periods: PeriodData[]) =>
        Effect.gen(function* () {
          // Validate period count before starting transaction
          const MIN_PERIODS = 1;
          const MAX_PERIODS = 31;

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

          return yield* sql.withTransaction(
            Effect.gen(function* () {
              // First check for active standalone cycle
              // Note: The database trigger also enforces this with an advisory lock for race condition protection
              const activeCycles = yield* drizzle
                .select()
                .from(cyclesTable)
                .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')))
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to check for active cycle',
                        cause: error,
                      }),
                  ),
                );

              if (activeCycles.length > 0) {
                return yield* Effect.fail(
                  new ActiveCycleExistsError({
                    message: 'Cannot create plan while user has an active standalone cycle',
                    userId,
                  }),
                );
              }

              // OV-02: Check that no period overlaps with any existing cycle
              yield* checkPeriodsOverlapWithCycles(
                userId,
                periods,
                'Plan periods cannot overlap with existing fasting cycles.',
              );

              // Create the plan
              const [planResult] = yield* drizzle
                .insert(plansTable)
                .values({
                  userId,
                  startDate,
                  status: 'InProgress',
                })
                .returning()
                .pipe(
                  Effect.mapError((error) => {
                    if (isUniqueViolation(error)) {
                      return new PlanAlreadyActiveError({
                        message: 'User already has an active plan',
                        userId,
                      });
                    }

                    if (isExclusionViolation(error)) {
                      return new ActiveCycleExistsError({
                        message:
                          'Cannot create a plan while an active fasting cycle exists. Please complete or cancel your active cycle first.',
                        userId,
                      });
                    }

                    return new PlanRepositoryError({
                      message: 'Failed to create plan in database',
                      cause: error,
                    });
                  }),
                );

              const plan = yield* S.decodeUnknown(PlanRecordSchema)(planResult).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );

              // Create all periods
              const periodValues = periods.map((period) => ({
                planId: plan.id,
                order: period.order,
                fastingDuration: period.fastingDuration,
                eatingWindow: period.eatingWindow,
                startDate: period.startDate,
                endDate: period.endDate,
                status: period.status,
              }));

              const periodResults = yield* drizzle
                .insert(periodsTable)
                .values(periodValues)
                .returning()
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to create periods in database',
                        cause: error,
                      }),
                  ),
                );

              const validatedPeriods = yield* Effect.all(
                periodResults.map((result) =>
                  S.decodeUnknown(PeriodRecordSchema)(result).pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanRepositoryError({
                          message: 'Failed to validate period record from database',
                          cause: error,
                        }),
                    ),
                  ),
                ),
              );

              return {
                ...plan,
                periods: validatedPeriods.sort((a, b) => a.order - b.order),
              };
            }),
          );
        }).pipe(
          Effect.mapError((error) => {
            // If error is already one of our domain errors, return it as-is
            if (
              error instanceof PlanRepositoryError ||
              error instanceof PlanAlreadyActiveError ||
              error instanceof ActiveCycleExistsError ||
              error instanceof InvalidPeriodCountError ||
              error instanceof PeriodOverlapWithCycleError
            ) {
              return error;
            }
            // Otherwise wrap it as a repository error
            return new PlanRepositoryError({
              message: 'Failed to create plan in database',
              cause: error,
            });
          }),
          Effect.tapError((error) => Effect.logError('Database error in createPlan', error)),
          Effect.annotateLogs({ repository: 'PlanRepository' }),
        ),

      getPlanById: (userId: string, planId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(plansTable)
            .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getPlanById', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to get plan by ID from database',
                    cause: error,
                  }),
              ),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to validate plan record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getPlanWithPeriods: (userId: string, planId: string) =>
        Effect.gen(function* () {
          const planOption = yield* repository.getPlanById(userId, planId);

          if (Option.isNone(planOption)) {
            return Option.none();
          }

          const plan = planOption.value;
          const periods = yield* repository.getPlanPeriods(planId);

          return Option.some({
            ...plan,
            periods,
          });
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getActivePlan: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(plansTable)
            .where(and(eq(plansTable.userId, userId), eq(plansTable.status, 'InProgress')))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getActivePlan', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to get active plan from database',
                    cause: error,
                  }),
              ),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to validate plan record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getActivePlanWithPeriods: (userId: string) =>
        Effect.gen(function* () {
          const planOption = yield* repository.getActivePlan(userId);

          if (Option.isNone(planOption)) {
            return Option.none();
          }

          const plan = planOption.value;
          const periods = yield* repository.getPlanPeriods(plan.id);

          return Option.some({
            ...plan,
            periods,
          });
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      updatePlanStatus: (userId: string, planId: string, status: PlanStatus) =>
        Effect.gen(function* () {
          // Only active plans can be transitioned
          const results = yield* drizzle
            .update(plansTable)
            .set({ status, updatedAt: new Date() })
            .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId), eq(plansTable.status, 'InProgress')))
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updatePlanStatus', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to update plan status in database',
                    cause: error,
                  }),
              ),
            );

          if (results.length === 0) {
            // Check if plan exists but is not active
            const existingPlan = yield* repository.getPlanById(userId, planId);

            if (Option.isNone(existingPlan)) {
              return yield* Effect.fail(
                new PlanNotFoundError({
                  message: 'Plan not found or does not belong to user',
                  userId,
                  planId,
                }),
              );
            }

            return yield* Effect.fail(
              new PlanInvalidStateError({
                message: 'Cannot update status of a plan that is not active',
                currentState: existingPlan.value.status,
                expectedState: 'InProgress',
              }),
            );
          }

          return yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to validate plan record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getPlanPeriods: (planId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(periodsTable)
            .where(eq(periodsTable.planId, planId))
            .orderBy(asc(periodsTable.order))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getPlanPeriods', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to get plan periods from database',
                    cause: error,
                  }),
              ),
            );

          return yield* Effect.all(
            results.map((result) =>
              S.decodeUnknown(PeriodRecordSchema)(result).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate period record from database',
                      cause: error,
                    }),
                ),
              ),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      updatePeriodStatus: (planId: string, periodId: string, status: PeriodStatus) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(periodsTable)
            .set({ status, updatedAt: new Date() })
            .where(and(eq(periodsTable.id, periodId), eq(periodsTable.planId, planId)))
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updatePeriodStatus', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to update period status in database',
                    cause: error,
                  }),
              ),
            );

          if (results.length === 0) {
            return yield* Effect.fail(
              new PeriodNotFoundError({
                message: 'Period not found or does not belong to plan',
                planId,
                periodId,
              }),
            );
          }

          return yield* S.decodeUnknown(PeriodRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to validate period record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      hasActivePlanOrCycle: (userId: string) =>
        Effect.gen(function* () {
          // Check for active plan
          const activePlans = yield* drizzle
            .select()
            .from(plansTable)
            .where(and(eq(plansTable.userId, userId), eq(plansTable.status, 'InProgress')))
            .pipe(
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to check for active plan',
                    cause: error,
                  }),
              ),
            );

          // Check for active standalone cycle
          const activeCycles = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')))
            .pipe(
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to check for active cycle',
                    cause: error,
                  }),
              ),
            );

          return {
            hasActivePlan: activePlans.length > 0,
            hasActiveCycle: activeCycles.length > 0,
          };
        }).pipe(
          Effect.tapError((error) => Effect.logError('Database error in hasActivePlanOrCycle', error)),
          Effect.annotateLogs({ repository: 'PlanRepository' }),
        ),

      deleteAllByUserId: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting all plans for user ${userId}`);
          yield* drizzle
            .delete(plansTable)
            .where(eq(plansTable.userId, userId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteAllByUserId', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to delete all plans for user from database',
                    cause: error,
                  }),
              ),
            );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getAllPlans: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(plansTable)
            .where(eq(plansTable.userId, userId))
            .orderBy(desc(plansTable.startDate))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getAllPlans', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to get all plans from database',
                    cause: error,
                  }),
              ),
            );

          return yield* Effect.all(
            results.map((result) =>
              S.decodeUnknown(PlanRecordSchema)(result).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              ),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      cancelPlanWithCyclePreservation: (userId: string, planId: string, inProgressPeriodStartDate: Date | null) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Cancelling plan ${planId} with cycle preservation`);

              // 1. Get the plan and validate it exists and is active
              const existingPlan = yield* getPlanOrFail(userId, planId);

              if (existingPlan.status !== 'InProgress') {
                return yield* Effect.fail(
                  new PlanInvalidStateError({
                    message: 'Cannot cancel a plan that is not active',
                    currentState: existingPlan.status,
                    expectedState: 'InProgress',
                  }),
                );
              }

              // 2. Update the plan status to Cancelled
              // Guard: filter by userId + status to prevent concurrent double-cancel race condition
              const cancellationTime = new Date();

              const updatedPlans = yield* drizzle
                .update(plansTable)
                .set({ status: 'Cancelled', updatedAt: cancellationTime })
                .where(
                  and(eq(plansTable.id, planId), eq(plansTable.userId, userId), eq(plansTable.status, 'InProgress')),
                )
                .returning()
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to update plan status in database',
                        cause: error,
                      }),
                  ),
                );

              // If no rows updated, the plan was cancelled by a concurrent request
              if (updatedPlans.length === 0) {
                return yield* Effect.fail(
                  new PlanInvalidStateError({
                    message: 'Plan was already cancelled by another request',
                    currentState: 'Cancelled',
                    expectedState: 'InProgress',
                  }),
                );
              }

              const updatedPlan = updatedPlans[0]!;

              // 3. If there was an in-progress period, create a completed cycle
              if (inProgressPeriodStartDate !== null) {
                yield* Effect.logInfo(
                  `Creating cycle to preserve fasting record (startDate: ${inProgressPeriodStartDate.toISOString()})`,
                );

                yield* drizzle
                  .insert(cyclesTable)
                  .values({
                    userId,
                    status: 'Completed',
                    startDate: inProgressPeriodStartDate,
                    endDate: cancellationTime,
                    notes: null,
                  })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanRepositoryError({
                          message: 'Failed to create cycle for in-progress period preservation',
                          cause: error,
                        }),
                    ),
                  );

                yield* Effect.logInfo('Cycle created successfully to preserve fasting history');
              }

              yield* Effect.logInfo(`Plan ${planId} cancelled successfully`);

              return yield* S.decodeUnknown(PlanRecordSchema)(updatedPlan).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );
            }),
          )
          .pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.fail(
                new PlanRepositoryError({
                  message: 'Transaction failed during plan cancellation',
                  cause: error,
                }),
              ),
            ),
            Effect.tapError((error) => Effect.logError('Database error in cancelPlanWithCyclePreservation', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),

      updatePlanPeriods: (
        userId: string,
        planId: string,
        periods: Array<{ id: string; fastingDuration: number; eatingWindow: number }>,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Updating periods for plan ${planId}`);

              // 1. Get the plan
              const existingPlan = yield* getPlanOrFail(userId, planId);

              // 2. Get existing periods
              const existingPeriods = yield* drizzle
                .select()
                .from(periodsTable)
                .where(eq(periodsTable.planId, planId))
                .orderBy(asc(periodsTable.order))
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to get periods from database',
                        cause: error,
                      }),
                  ),
                );

              // 3. Validate period count matches (IM-01: periods cannot be deleted)
              if (periods.length !== existingPeriods.length) {
                return yield* Effect.fail(
                  new PeriodsMismatchError({
                    message: `Period count mismatch: expected ${existingPeriods.length}, received ${periods.length}`,
                    expectedCount: existingPeriods.length,
                    receivedCount: periods.length,
                  }),
                );
              }

              // 4. Validate no duplicate period IDs in input
              const inputPeriodIds = new Set(periods.map((p) => p.id));
              if (inputPeriodIds.size !== periods.length) {
                // Find the first duplicate ID for the error message
                const seenIds = new Set<string>();
                let duplicateId = '';
                for (const period of periods) {
                  if (seenIds.has(period.id)) {
                    duplicateId = period.id;
                    break;
                  }
                  seenIds.add(period.id);
                }
                return yield* Effect.fail(
                  new PeriodNotInPlanError({
                    message: `Duplicate period ID ${duplicateId} in request`,
                    planId,
                    periodId: duplicateId,
                  }),
                );
              }

              // 5. Create a map of existing period IDs
              const existingPeriodIds = new Set(existingPeriods.map((p) => p.id));

              // 6. Validate all input period IDs belong to the plan
              for (const period of periods) {
                if (!existingPeriodIds.has(period.id)) {
                  return yield* Effect.fail(
                    new PeriodNotInPlanError({
                      message: `Period ${period.id} does not belong to plan ${planId}`,
                      planId,
                      periodId: period.id,
                    }),
                  );
                }
              }

              // 7. Create a map of input periods by ID for easy lookup
              const inputPeriodMap = new Map(periods.map((p) => [p.id, p]));

              // 8. Validate all existing period IDs are in the input
              // (With count match + no duplicates + all input IDs valid, this is guaranteed,
              // but we add this as a defensive check)
              for (const existingPeriod of existingPeriods) {
                if (!inputPeriodMap.has(existingPeriod.id)) {
                  return yield* Effect.fail(
                    new PeriodNotInPlanError({
                      message: `Missing period ${existingPeriod.id} in request`,
                      planId,
                      periodId: existingPeriod.id,
                    }),
                  );
                }
              }

              // 9. Calculate new dates maintaining contiguity (ED-03)
              // Sort existing periods by order to maintain sequence
              const sortedExistingPeriods = [...existingPeriods].sort((a, b) => a.order - b.order);
              const ONE_HOUR_MS = 3600000;

              let currentDate = existingPlan.startDate;
              const updatedPeriodData: Array<{
                id: string;
                fastingDuration: number;
                eatingWindow: number;
                startDate: Date;
                endDate: Date;
              }> = [];

              for (const existingPeriod of sortedExistingPeriods) {
                // Defensive check: should never be undefined due to validation above
                const inputPeriod = inputPeriodMap.get(existingPeriod.id);
                if (!inputPeriod) {
                  return yield* Effect.fail(
                    new PeriodNotInPlanError({
                      message: `Period ${existingPeriod.id} not found in input (unexpected)`,
                      planId,
                      periodId: existingPeriod.id,
                    }),
                  );
                }

                const periodStart = new Date(currentDate);
                const totalDurationMs = (inputPeriod.fastingDuration + inputPeriod.eatingWindow) * ONE_HOUR_MS;
                const periodEnd = new Date(periodStart.getTime() + totalDurationMs);

                updatedPeriodData.push({
                  id: existingPeriod.id,
                  fastingDuration: inputPeriod.fastingDuration,
                  eatingWindow: inputPeriod.eatingWindow,
                  startDate: periodStart,
                  endDate: periodEnd,
                });

                currentDate = periodEnd;
              }

              // 10. Check for overlaps with existing cycles (ED-04, OV-02)
              yield* checkPeriodsOverlapWithCycles(
                userId,
                updatedPeriodData,
                'Updated periods cannot overlap with existing fasting cycles.',
              );

              // 11. Update all periods in the transaction
              const updatedPeriods: Array<typeof periodsTable.$inferSelect> = [];

              for (const periodData of updatedPeriodData) {
                const [updatedPeriod] = yield* drizzle
                  .update(periodsTable)
                  .set({
                    fastingDuration: periodData.fastingDuration,
                    eatingWindow: periodData.eatingWindow,
                    startDate: periodData.startDate,
                    endDate: periodData.endDate,
                    updatedAt: new Date(),
                  })
                  .where(eq(periodsTable.id, periodData.id))
                  .returning()
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanRepositoryError({
                          message: `Failed to update period ${periodData.id}`,
                          cause: error,
                        }),
                    ),
                  );

                updatedPeriods.push(updatedPeriod!);
              }

              // 12. Validate and return the result
              const validatedPeriods = yield* Effect.all(
                updatedPeriods.map((result) =>
                  S.decodeUnknown(PeriodRecordSchema)(result).pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanRepositoryError({
                          message: 'Failed to validate period record from database',
                          cause: error,
                        }),
                    ),
                  ),
                ),
              );

              yield* Effect.logInfo(`Successfully updated ${validatedPeriods.length} periods for plan ${planId}`);

              return {
                ...existingPlan,
                periods: validatedPeriods.sort((a, b) => a.order - b.order),
              };
            }),
          )
          .pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.fail(
                new PlanRepositoryError({
                  message: 'Transaction failed during period update',
                  cause: error,
                }),
              ),
            ),
            Effect.tapError((error) => Effect.logError('Database error in updatePlanPeriods', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),
    };

    return repository;
  }),
  accessors: true,
}) {}
