import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Effect, Option, Schema as S } from 'effect';
import { plansTable, periodsTable, cyclesTable, isUniqueViolation, isExclusionViolation } from '../../../db';
import { PlanRepositoryError } from './errors';
import {
  type PlanStatus,
  type PeriodWriteData,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  PeriodOverlapWithCycleError,
  PeriodsNotCompletedError,
  assertPlanIsInProgress,
  recalculatePeriodDates,
} from '../domain';
import { type PeriodData, PlanRecordSchema, PeriodRecordSchema } from './schemas';
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
      createPlan: (userId: string, startDate: Date, periods: PeriodData[], name: string, description?: string) =>
        Effect.gen(function* () {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
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
                  name,
                  description: description ?? null,
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
                fastingDuration: String(period.fastingDuration),
                eatingWindow: String(period.eatingWindow),
                startDate: period.startDate,
                endDate: period.endDate,
                fastingStartDate: period.fastingStartDate,
                fastingEndDate: period.fastingEndDate,
                eatingStartDate: period.eatingStartDate,
                eatingEndDate: period.eatingEndDate,
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
            activePlanId: activePlans.length > 0 ? activePlans[0]!.id : null,
            activeCycleId: activeCycles.length > 0 ? activeCycles[0]!.id : null,
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

      cancelPlanWithCyclePreservation: (
        userId: string,
        planId: string,
        inProgressPeriodFastingDates: { fastingStartDate: Date; fastingEndDate: Date } | null,
        completedPeriodsFastingDates: Array<{ fastingStartDate: Date; fastingEndDate: Date }>,
        now: Date,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Cancelling plan ${planId} with cycle preservation`);

              // 1. Get the plan and validate it exists and is active
              const existingPlan = yield* getPlanOrFail(userId, planId);

              // BR-01: Assert plan is InProgress before mutation
              yield* assertPlanIsInProgress(existingPlan.status);

              // 2. Update the plan status to Cancelled
              // Guard: filter by userId + status to prevent concurrent double-cancel race condition
              const cancellationTime = now;

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

              // 3. Create cycles for all completed periods
              if (completedPeriodsFastingDates.length > 0) {
                yield* Effect.logInfo(`Creating ${completedPeriodsFastingDates.length} cycles for completed periods`);

                for (const period of completedPeriodsFastingDates) {
                  yield* drizzle
                    .insert(cyclesTable)
                    .values({
                      userId,
                      status: 'Completed',
                      startDate: period.fastingStartDate,
                      endDate: period.fastingEndDate,
                      notes: null,
                    })
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanRepositoryError({
                            message: 'Failed to create cycle for completed period preservation',
                            cause: error,
                          }),
                      ),
                    );
                }

                yield* Effect.logInfo(`Created ${completedPeriodsFastingDates.length} cycles for completed periods`);
              }

              // 4. If there was an in-progress period, create a completed cycle (only fasting portion)
              if (inProgressPeriodFastingDates !== null) {
                const { fastingStartDate, fastingEndDate } = inProgressPeriodFastingDates;

                // Determine cycle end date:
                // - If cancelled during fasting (now < fastingEndDate): use cancellation time
                // - If cancelled during eating window (now >= fastingEndDate): use fastingEndDate
                const cycleEndDate = cancellationTime < fastingEndDate ? cancellationTime : fastingEndDate;

                yield* Effect.logInfo(
                  `Creating cycle for in-progress period (startDate: ${fastingStartDate.toISOString()}, endDate: ${cycleEndDate.toISOString()})`,
                );

                yield* drizzle
                  .insert(cyclesTable)
                  .values({
                    userId,
                    status: 'Completed',
                    startDate: fastingStartDate,
                    endDate: cycleEndDate,
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

                yield* Effect.logInfo('Cycle created successfully for in-progress period');
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

      persistPeriodUpdate: (
        userId: string,
        planId: string,
        periodsToWrite: ReadonlyArray<PeriodWriteData>,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Persisting period update for plan ${planId}`);

              // 1. Get the plan (needed for the return value)
              // PlanNotFoundError is unexpected here (service already verified), so map to PlanRepositoryError
              const existingPlan = yield* getPlanOrFail(userId, planId).pipe(
                Effect.catchTag('PlanNotFoundError', (e) =>
                  Effect.fail(
                    new PlanRepositoryError({
                      message: `Unexpected: plan ${planId} not found during persistence phase`,
                      cause: e,
                    }),
                  ),
                ),
              );

              // 2. Check for overlaps with existing cycles (ED-04, OV-02)
              yield* checkPeriodsOverlapWithCycles(
                userId,
                [...periodsToWrite],
                'Updated periods cannot overlap with existing fasting cycles.',
              );

              // 3. Delete ALL existing periods for this plan
              yield* drizzle
                .delete(periodsTable)
                .where(eq(periodsTable.planId, planId))
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to delete existing periods',
                        cause: error,
                      }),
                  ),
                );

              // 4. Insert ALL final periods (preserving original UUIDs for existing, new UUIDs for new)
              const insertValues = periodsToWrite.map((p) => ({
                ...(p.id !== null ? { id: p.id } : {}),
                planId,
                order: p.order,
                fastingDuration: String(p.fastingDuration),
                eatingWindow: String(p.eatingWindow),
                startDate: p.startDate,
                endDate: p.endDate,
                fastingStartDate: p.fastingStartDate,
                fastingEndDate: p.fastingEndDate,
                eatingStartDate: p.eatingStartDate,
                eatingEndDate: p.eatingEndDate,
              }));

              const insertedPeriods = yield* drizzle
                .insert(periodsTable)
                .values(insertValues)
                .returning()
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to insert periods',
                        cause: error,
                      }),
                  ),
                );

              // 5. Validate and return the result
              const validatedPeriods = yield* Effect.all(
                insertedPeriods.map((result) =>
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

              yield* Effect.logInfo(`Successfully persisted ${validatedPeriods.length} periods for plan ${planId}`);

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
            Effect.tapError((error) => Effect.logError('Database error in persistPeriodUpdate', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),

      completePlanWithValidation: (userId: string, planId: string, now: Date) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Completing plan ${planId} with validation`);

              // 1. Get the plan and validate it exists
              const existingPlan = yield* getPlanOrFail(userId, planId);

              // BR-01: Assert plan is InProgress before mutation
              yield* assertPlanIsInProgress(existingPlan.status);

              // 3. Get the last period by order and check if now >= lastPeriod.endDate
              const periods = yield* drizzle
                .select()
                .from(periodsTable)
                .where(eq(periodsTable.planId, planId))
                .orderBy(desc(periodsTable.order))
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to get periods from database',
                        cause: error,
                      }),
                  ),
                );

              if (periods.length === 0) {
                return yield* Effect.fail(
                  new PeriodsNotCompletedError({
                    message: 'Cannot complete plan: no periods found',
                    planId,
                    completedCount: 0,
                    totalCount: 0,
                  }),
                );
              }

              const lastPeriod = periods[0]!;

              // Check if current time is past the last period's end date
              if (now < lastPeriod.endDate) {
                // Calculate completed count based on periods where now >= endDate
                const completedCount = periods.filter((p) => now >= p.endDate).length;
                const totalCount = periods.length;

                return yield* Effect.fail(
                  new PeriodsNotCompletedError({
                    message: `Cannot complete plan: ${completedCount} of ${totalCount} periods are completed`,
                    planId,
                    completedCount,
                    totalCount,
                  }),
                );
              }

              // 4. Create a cycle for each completed period (only the fasting portion)
              yield* Effect.logInfo(`Creating ${periods.length} cycles for completed periods`);

              for (const period of periods) {
                yield* drizzle
                  .insert(cyclesTable)
                  .values({
                    userId,
                    status: 'Completed',
                    startDate: period.fastingStartDate,
                    endDate: period.fastingEndDate,
                    notes: null,
                  })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new PlanRepositoryError({
                          message: `Failed to create cycle for period ${period.order}`,
                          cause: error,
                        }),
                    ),
                  );
              }

              yield* Effect.logInfo(`Created ${periods.length} cycles successfully`);

              // 5. Update plan status to Completed
              const updatedPlans = yield* drizzle
                .update(plansTable)
                .set({ status: 'Completed', updatedAt: new Date() })
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

              // If no rows updated, plan state changed concurrently
              if (updatedPlans.length === 0) {
                const currentPlan = yield* getPlanOrFail(userId, planId);
                return yield* Effect.fail(
                  new PlanInvalidStateError({
                    message: `Plan was modified concurrently and is now in ${currentPlan.status} state`,
                    currentState: currentPlan.status,
                    expectedState: 'InProgress',
                  }),
                );
              }

              yield* Effect.logInfo(`Plan ${planId} completed successfully`);

              return yield* S.decodeUnknown(PlanRecordSchema)(updatedPlans[0]).pipe(
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
                  message: 'Transaction failed during plan completion',
                  cause: error,
                }),
              ),
            ),
            Effect.tapError((error) => Effect.logError('Database error in completePlanWithValidation', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),

      updatePlanMetadata: (
        userId: string,
        planId: string,
        metadata: {
          name?: string;
          description?: string;
          startDate?: Date;
        },
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Updating metadata for plan ${planId}`);

              // 1. Get the plan and validate it exists
              const existingPlan = yield* getPlanOrFail(userId, planId);

              // BR-01: Assert plan is InProgress before mutation
              yield* assertPlanIsInProgress(existingPlan.status);

              // 3. Get existing periods
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

              // 4. If startDate changed, recalculate all periods
              const startDateChanged =
                metadata.startDate !== undefined && metadata.startDate.getTime() !== existingPlan.startDate.getTime();

              if (startDateChanged && existingPeriods.length > 0) {
                yield* Effect.logInfo('Start date changed, recalculating period dates');

                // Pure core function: recalculate all dates from new start date preserving durations
                const durationInputs = existingPeriods.map((p) => ({
                  fastingDuration: Number(p.fastingDuration),
                  eatingWindow: Number(p.eatingWindow),
                }));
                const recalculated = recalculatePeriodDates(metadata.startDate!, durationInputs);

                // Map back to include original period IDs
                const recalculatedPeriods = recalculated.map((calc, index) => ({
                  id: existingPeriods[index]!.id,
                  ...calc,
                }));

                // 5. Check for overlaps with existing cycles (BR-02: uses full period range)
                yield* checkPeriodsOverlapWithCycles(
                  userId,
                  recalculatedPeriods,
                  'Updated plan start date would cause periods to overlap with existing fasting cycles.',
                );

                // 6. Update all periods
                for (const periodData of recalculatedPeriods) {
                  yield* drizzle
                    .update(periodsTable)
                    .set({
                      startDate: periodData.startDate,
                      endDate: periodData.endDate,
                      fastingStartDate: periodData.fastingStartDate,
                      fastingEndDate: periodData.fastingEndDate,
                      eatingStartDate: periodData.eatingStartDate,
                      eatingEndDate: periodData.eatingEndDate,
                      updatedAt: new Date(),
                    })
                    .where(eq(periodsTable.id, periodData.id))
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanRepositoryError({
                            message: `Failed to update period ${periodData.id}`,
                            cause: error,
                          }),
                      ),
                    );
                }

                yield* Effect.logInfo(`Recalculated ${recalculatedPeriods.length} periods`);
              }

              // 7. Build update object for plan metadata
              const updateData: {
                name?: string;
                description?: string | null;
                startDate?: Date;
                updatedAt: Date;
              } = { updatedAt: new Date() };

              if (metadata.name !== undefined) {
                updateData.name = metadata.name;
              }
              if (metadata.description !== undefined) {
                updateData.description = metadata.description.trim() === '' ? null : metadata.description;
              }
              if (metadata.startDate !== undefined) {
                updateData.startDate = metadata.startDate;
              }

              // 8. Update the plan
              const [updatedPlan] = yield* drizzle
                .update(plansTable)
                .set(updateData)
                .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId)))
                .returning()
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to update plan in database',
                        cause: error,
                      }),
                  ),
                );

              const validatedPlan = yield* S.decodeUnknown(PlanRecordSchema)(updatedPlan).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );

              // 9. Get updated periods
              const updatedPeriods = yield* drizzle
                .select()
                .from(periodsTable)
                .where(eq(periodsTable.planId, planId))
                .orderBy(asc(periodsTable.order))
                .pipe(
                  Effect.mapError(
                    (error) =>
                      new PlanRepositoryError({
                        message: 'Failed to get updated periods from database',
                        cause: error,
                      }),
                  ),
                );

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

              yield* Effect.logInfo(`Successfully updated metadata for plan ${planId}`);

              return {
                ...validatedPlan,
                periods: validatedPeriods,
              };
            }),
          )
          .pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.fail(
                new PlanRepositoryError({
                  message: 'Transaction failed during plan metadata update',
                  cause: error,
                }),
              ),
            ),
            Effect.tapError((error) => Effect.logError('Database error in updatePlanMetadata', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),
    };

    return repository;
  }),
  accessors: true,
}) {}
