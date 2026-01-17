import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Array, Effect, Option, Schema as S } from 'effect';
import { plansTable, periodsTable, cyclesTable } from '../../../db';
import { PlanRepositoryError } from './errors';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  PeriodNotFoundError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
} from '../domain';
import { type PeriodData, type PlanStatus, type PeriodStatus, PlanRecordSchema, PeriodRecordSchema } from './schemas';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { IPlanRepository } from './plan.repository.interface';

export class PlanRepositoryPostgres extends Effect.Service<PlanRepositoryPostgres>()('PlanRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const sql = yield* SqlClient.SqlClient;

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

              // Create the plan
              const [planResult] = yield* drizzle
                .insert(plansTable)
                .values({
                  userId,
                  startDate,
                  status: 'active',
                })
                .returning()
                .pipe(
                  Effect.mapError((error) => {
                    // Check for unique constraint violation (active plan exists)
                    const isUniqueViolation = (err: unknown): boolean =>
                      typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

                    const causeChain = Array.unfold(error, (currentError) =>
                      currentError
                        ? Option.some([
                            currentError,
                            typeof currentError === 'object' && 'cause' in currentError
                              ? (currentError as any).cause
                              : undefined,
                          ])
                        : Option.none(),
                    );

                    if (Array.findFirst(causeChain, isUniqueViolation).pipe(Option.isSome)) {
                      return new PlanAlreadyActiveError({
                        message: 'User already has an active plan',
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
              error instanceof InvalidPeriodCountError
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
            .where(and(eq(plansTable.userId, userId), eq(plansTable.status, 'active')))
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
            .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId), eq(plansTable.status, 'active')))
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
                expectedState: 'active',
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
            .where(and(eq(plansTable.userId, userId), eq(plansTable.status, 'active')))
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

      deletePlan: (userId: string, planId: string) =>
        Effect.gen(function* () {
          yield* drizzle
            .delete(plansTable)
            .where(and(eq(plansTable.id, planId), eq(plansTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deletePlan', error)),
              Effect.mapError(
                (error) =>
                  new PlanRepositoryError({
                    message: 'Failed to delete plan from database',
                    cause: error,
                  }),
              ),
            );
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

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
    };

    return repository;
  }),
  accessors: true,
}) {}
