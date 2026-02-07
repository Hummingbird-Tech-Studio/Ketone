import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Effect, Option, Schema as S } from 'effect';
import { plansTable, periodsTable, cyclesTable, isUniqueViolation, isExclusionViolation } from '../../../db';
import { PlanRepositoryError } from './errors';
import {
  type Plan,
  type PlanStatus,
  type PeriodWriteData,
  type CycleCreateInput,
  PlanWithPeriods,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  PeriodOverlapWithCycleError,
} from '../domain';
import { type PeriodData, PlanRecordSchema, PeriodRecordSchema } from './schemas';
import { decodePlan, decodePeriod, decodePlanWithPeriods } from './mappers';
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

        const record = yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
          Effect.mapError(
            (error) =>
              new PlanRepositoryError({
                message: 'Failed to validate plan record from database',
                cause: error,
              }),
          ),
        );
        return yield* decodePlan(record);
      });

    /**
     * Helper: Decode a single DB row into Option<Plan>.
     * Returns None if results array is empty, Some(Plan) otherwise.
     */
    const decodePlanOption = (results: unknown[]): Effect.Effect<Option.Option<Plan>, PlanRepositoryError> =>
      Effect.gen(function* () {
        if (results.length === 0) {
          return Option.none();
        }

        const record = yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
          Effect.mapError(
            (error) =>
              new PlanRepositoryError({
                message: 'Failed to validate plan record from database',
                cause: error,
              }),
          ),
        );
        const plan = yield* decodePlan(record);

        return Option.some(plan);
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

              const planRecord = yield* S.decodeUnknown(PlanRecordSchema)(planResult).pipe(
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
                planId: planRecord.id,
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

              const periodRecords = yield* Effect.all(
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

              return yield* decodePlanWithPeriods(
                planRecord,
                periodRecords.sort((a, b) => a.order - b.order),
              );
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

          return yield* decodePlanOption(results);
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getPlanWithPeriods: (userId: string, planId: string) =>
        Effect.gen(function* () {
          const planOption = yield* repository.getPlanById(userId, planId);

          if (Option.isNone(planOption)) {
            return Option.none();
          }

          const plan = planOption.value;
          const periods = yield* repository.getPlanPeriods(planId);

          return Option.some(
            new PlanWithPeriods({
              ...plan,
              periods,
            }),
          );
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

          return yield* decodePlanOption(results);
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      getActivePlanWithPeriods: (userId: string) =>
        Effect.gen(function* () {
          const planOption = yield* repository.getActivePlan(userId);

          if (Option.isNone(planOption)) {
            return Option.none();
          }

          const plan = planOption.value;
          const periods = yield* repository.getPlanPeriods(plan.id);

          return Option.some(
            new PlanWithPeriods({
              ...plan,
              periods,
            }),
          );
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

          const record = yield* S.decodeUnknown(PlanRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new PlanRepositoryError({
                  message: 'Failed to validate plan record from database',
                  cause: error,
                }),
            ),
          );
          return yield* decodePlan(record);
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
                Effect.flatMap(decodePeriod),
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
                Effect.flatMap(decodePlan),
              ),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      cancelPlanWithCyclePreservation: (
        userId: string,
        planId: string,
        inProgressPeriodFastingDates: { fastingStartDate: Date; fastingEndDate: Date } | null,
        completedPeriodsFastingDates: Array<{ fastingStartDate: Date; fastingEndDate: Date }>,
        cancelledAt: Date,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Cancelling plan ${planId} with cycle preservation`);

              // 1. Update the plan status to Cancelled with concurrency guard
              const updatedPlans = yield* drizzle
                .update(plansTable)
                .set({ status: 'Cancelled', updatedAt: cancelledAt })
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

              // If no rows updated, plan was concurrently modified (no longer InProgress)
              if (updatedPlans.length === 0) {
                return yield* Effect.fail(
                  new PlanInvalidStateError({
                    message: 'Plan was already completed or cancelled by another request',
                    currentState: 'Cancelled',
                    expectedState: 'InProgress',
                  }),
                );
              }

              const updatedPlan = updatedPlans[0]!;

              // 2. Create cycles for all completed periods
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

              // 3. If there was an in-progress period, create a completed cycle using pre-computed fasting dates
              if (inProgressPeriodFastingDates !== null) {
                const { fastingStartDate, fastingEndDate } = inProgressPeriodFastingDates;

                yield* Effect.logInfo(
                  `Creating cycle for in-progress period (startDate: ${fastingStartDate.toISOString()}, endDate: ${fastingEndDate.toISOString()})`,
                );

                yield* drizzle
                  .insert(cyclesTable)
                  .values({
                    userId,
                    status: 'Completed',
                    startDate: fastingStartDate,
                    endDate: fastingEndDate,
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

              const record = yield* S.decodeUnknown(PlanRecordSchema)(updatedPlan).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );
              return yield* decodePlan(record);
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

      persistPeriodUpdate: (userId: string, planId: string, periodsToWrite: ReadonlyArray<PeriodWriteData>) =>
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
              const periodRecords = yield* Effect.all(
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

              yield* Effect.logInfo(`Successfully persisted ${periodRecords.length} periods for plan ${planId}`);

              return yield* decodePlanWithPeriods(
                existingPlan,
                periodRecords.sort((a, b) => a.order - b.order),
              );
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

      persistPlanCompletion: (
        userId: string,
        planId: string,
        cyclesToCreate: ReadonlyArray<CycleCreateInput>,
        completedAt: Date,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Persisting plan completion for plan ${planId}`);

              // 1. Create cycles from pre-computed decision data
              if (cyclesToCreate.length > 0) {
                yield* Effect.logInfo(`Creating ${cyclesToCreate.length} cycles for completed periods`);

                for (const cycle of cyclesToCreate) {
                  yield* drizzle
                    .insert(cyclesTable)
                    .values({
                      userId: cycle.userId,
                      status: 'Completed',
                      startDate: cycle.startDate,
                      endDate: cycle.endDate,
                      notes: null,
                    })
                    .pipe(
                      Effect.mapError(
                        (error) =>
                          new PlanRepositoryError({
                            message: 'Failed to create cycle for completed period',
                            cause: error,
                          }),
                      ),
                    );
                }

                yield* Effect.logInfo(`Created ${cyclesToCreate.length} cycles successfully`);
              }

              // 2. Update plan status to Completed with concurrency guard
              const updatedPlans = yield* drizzle
                .update(plansTable)
                .set({ status: 'Completed', updatedAt: completedAt })
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

              // If no rows updated, plan was concurrently modified (no longer InProgress)
              if (updatedPlans.length === 0) {
                return yield* Effect.fail(
                  new PlanInvalidStateError({
                    message: 'Plan was already completed or cancelled by another request',
                    currentState: 'Completed',
                    expectedState: 'InProgress',
                  }),
                );
              }

              yield* Effect.logInfo(`Plan ${planId} completed successfully`);

              // 3. Decode and return the updated Plan
              const record = yield* S.decodeUnknown(PlanRecordSchema)(updatedPlans[0]).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );
              return yield* decodePlan(record);
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
            Effect.tapError((error) => Effect.logError('Database error in persistPlanCompletion', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),

      persistMetadataUpdate: (
        userId: string,
        planId: string,
        planUpdate: {
          readonly name?: string;
          readonly description?: string | null;
          readonly startDate?: Date;
        },
        recalculatedPeriods: ReadonlyArray<{
          readonly id: string;
          readonly startDate: Date;
          readonly endDate: Date;
          readonly fastingStartDate: Date;
          readonly fastingEndDate: Date;
          readonly eatingStartDate: Date;
          readonly eatingEndDate: Date;
        }> | null,
      ) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* Effect.logInfo(`Persisting metadata update for plan ${planId}`);

              // 1. If recalculated periods provided, check overlaps and update period rows
              if (recalculatedPeriods !== null) {
                yield* checkPeriodsOverlapWithCycles(
                  userId,
                  [...recalculatedPeriods],
                  'Updated plan start date would cause periods to overlap with existing fasting cycles.',
                );

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

                yield* Effect.logInfo(`Updated ${recalculatedPeriods.length} recalculated periods`);
              }

              // 2. Update plan metadata fields
              const updatedPlans = yield* drizzle
                .update(plansTable)
                .set({ ...planUpdate, updatedAt: new Date() })
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

              if (updatedPlans.length === 0) {
                return yield* Effect.fail(
                  new PlanRepositoryError({
                    message: `Unexpected: plan ${planId} not found during metadata update persistence`,
                  }),
                );
              }

              const planRecord = yield* S.decodeUnknown(PlanRecordSchema)(updatedPlans[0]).pipe(
                Effect.mapError(
                  (error) =>
                    new PlanRepositoryError({
                      message: 'Failed to validate plan record from database',
                      cause: error,
                    }),
                ),
              );

              // 3. Re-fetch periods and return PlanWithPeriods
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

              const periodRecords = yield* Effect.all(
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

              yield* Effect.logInfo(`Successfully persisted metadata update for plan ${planId}`);

              return yield* decodePlanWithPeriods(planRecord, periodRecords);
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
            Effect.tapError((error) => Effect.logError('Database error in persistMetadataUpdate', error)),
            Effect.annotateLogs({ repository: 'PlanRepository' }),
          ),
    };

    return repository;
  }),
  dependencies: [],
  accessors: true,
}) {}
