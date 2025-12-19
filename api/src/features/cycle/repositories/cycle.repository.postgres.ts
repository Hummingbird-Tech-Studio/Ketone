import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { SqlClient } from '@effect/sql';
import { Array, Effect, Option, Schema as S } from 'effect';
import { type FastingFeeling, FastingFeelingSchema, MAX_FEELINGS_PER_CYCLE } from '@ketone/shared';
import { cyclesTable, cycleFeelingsTable } from '../../../db';
import { CycleRepositoryError } from './errors';
import {
  CycleAlreadyInProgressError,
  CycleInvalidStateError,
  CycleNotFoundError,
  FeelingsLimitExceededError,
} from '../domain';
import { type CycleData, CycleRecordSchema } from './schemas';
import { and, asc, desc, eq, gt, lt, lte, ne, or } from 'drizzle-orm';
import type { ICycleRepository } from './cycle.repository.interface';

export class CycleRepositoryPostgres extends Effect.Service<CycleRepositoryPostgres>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const sql = yield* SqlClient.SqlClient;

    const repository: ICycleRepository = {
      getCycleById: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getCycleById', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get cycle by ID from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getActiveCycle: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getActiveCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get active cycle from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getLastCompletedCycle: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'Completed')))
            .orderBy(desc(cyclesTable.endDate))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getLastCompletedCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get last completed cycle from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getPreviousCycle: (userId: string, cycleId: string, referenceStartDate: Date) =>
        Effect.gen(function* () {
          // Find the completed cycle with startDate closest to (but before) referenceStartDate
          // Excludes the current cycle and only considers Completed cycles
          // Uses startDate as reference to find cycles that started before the current cycle,
          // ensuring we find adjacent cycles regardless of any existing overlap
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(
              and(
                eq(cyclesTable.userId, userId),
                eq(cyclesTable.status, 'Completed'),
                ne(cyclesTable.id, cycleId),
                lt(cyclesTable.startDate, referenceStartDate),
              ),
            )
            .orderBy(desc(cyclesTable.startDate))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getPreviousCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get previous cycle from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getNextCycle: (userId: string, cycleId: string, referenceStartDate: Date) =>
        Effect.gen(function* () {
          // Find the cycle with startDate closest to (but after) referenceStartDate
          // Excludes the current cycle and considers both Completed and InProgress cycles
          // (InProgress cycles can also cause overlap when editing a completed cycle's end date)
          // Uses startDate as reference to find cycles that begin after the current cycle started,
          // ensuring we find adjacent cycles regardless of any existing overlap
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(
              and(
                eq(cyclesTable.userId, userId),
                or(eq(cyclesTable.status, 'Completed'), eq(cyclesTable.status, 'InProgress')),
                ne(cyclesTable.id, cycleId),
                gt(cyclesTable.startDate, referenceStartDate),
              ),
            )
            .orderBy(asc(cyclesTable.startDate))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getNextCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get next cycle from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      createCycle: (data: CycleData) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .insert(cyclesTable)
            .values({
              userId: data.userId,
              status: data.status,
              startDate: data.startDate,
              endDate: data.endDate,
              notes: data.notes ?? null,
            })
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in createCycle', error)),
              Effect.mapError((error) => {
                // Check for PostgreSQL constraint violations:
                // - 23505: unique_violation (multiple InProgress cycles)
                // - 23P01: exclusion_violation (overlapping cycles via trigger)
                const isUniqueViolation = (err: unknown): boolean =>
                  typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

                const isExclusionViolation = (err: unknown): boolean =>
                  typeof err === 'object' && err !== null && 'code' in err && err.code === '23P01';

                // Generate chain of causes using functional approach with Array.unfold
                // This generates [error, error.cause, error.cause.cause, ...] until no more causes
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

                const uniqueViolation = Array.findFirst(causeChain, isUniqueViolation);
                const exclusionViolation = Array.findFirst(causeChain, isExclusionViolation);

                // Both constraint violations mean user already has an active cycle
                if (Option.isSome(uniqueViolation) || Option.isSome(exclusionViolation)) {
                  return new CycleAlreadyInProgressError({
                    message: 'User already has a cycle in progress',
                    userId: data.userId,
                  });
                }

                return new CycleRepositoryError({
                  message: 'Failed to create cycle in database',
                  cause: error,
                });
              }),
            );

          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      updateCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date, notes?: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({ startDate, endDate, ...(notes !== undefined && { notes }) })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updateCycleDates', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to update cycle dates in database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot update dates of a cycle that is not in progress',
                currentState: 'Unknown or Completed',
                expectedState: 'InProgress',
              }),
            );
          }

          return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      completeCycle: (userId: string, cycleId: string, startDate: Date, endDate: Date, notes?: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({
              status: 'Completed',
              startDate,
              endDate,
              ...(notes !== undefined && { notes }),
            })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in completeCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to complete cycle in database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot complete cycle: cycle may not exist, belong to another user, or not be in progress',
                currentState: 'NotFound, NotOwned, or NotInProgress',
                expectedState: 'InProgress',
              }),
            );
          }

          return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      updateCompletedCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date, notes?: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({ startDate, endDate, ...(notes !== undefined && { notes }) })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'Completed')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updateCompletedCycleDates', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to update completed cycle dates in database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message:
                  'Cannot update completed cycle: cycle may not exist, belong to another user, or not be in completed state',
                currentState: 'NotFound, NotOwned, or NotCompleted',
                expectedState: 'Completed',
              }),
            );
          }

          return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      deleteCycle: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          yield* drizzle
            .delete(cyclesTable)
            .where(and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to delete cycle from database',
                  cause: error,
                });
              }),
            );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      deleteAllByUserId: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting all cycles for user ${userId}`);
          yield* drizzle
            .delete(cyclesTable)
            .where(eq(cyclesTable.userId, userId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteAllByUserId', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to delete all cycles for user from database',
                  cause: error,
                });
              }),
            );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getCyclesByPeriod: (userId: string, periodStart: Date, periodEnd: Date) =>
        Effect.gen(function* () {
          // Find cycles that overlap with the period
          // A cycle overlaps if: startDate <= periodEnd AND (endDate > periodStart OR status = 'InProgress')
          // InProgress cycles are included regardless of endDate since they're still running
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(
              and(
                eq(cyclesTable.userId, userId),
                lte(cyclesTable.startDate, periodEnd),
                or(gt(cyclesTable.endDate, periodStart), eq(cyclesTable.status, 'InProgress')),
              ),
            )
            .orderBy(desc(cyclesTable.startDate))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getCyclesByPeriod', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get cycles by period from database',
                  cause: error,
                });
              }),
            );

          return yield* Effect.all(
            results.map((result) =>
              S.decodeUnknown(CycleRecordSchema)(result).pipe(
                Effect.mapError(
                  (error) =>
                    new CycleRepositoryError({
                      message: 'Failed to validate cycle record from database',
                      cause: error,
                    }),
                ),
              ),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      updateCycleNotes: (userId: string, cycleId: string, notes: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({ notes })
            .where(and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId)))
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updateCycleNotes', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to update cycle notes in database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'Cycle not found or does not belong to user',
                userId,
              }),
            );
          }

          return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from database',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      getFeelingsByCycleId: (cycleId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select({ feeling: cycleFeelingsTable.feeling })
            .from(cycleFeelingsTable)
            .where(eq(cycleFeelingsTable.cycleId, cycleId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getFeelingsByCycleId', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to get feelings from database',
                  cause: error,
                });
              }),
            );

          return yield* Effect.all(
            results.map((result) =>
              S.decodeUnknown(FastingFeelingSchema)(result.feeling).pipe(
                Effect.mapError(
                  (error) =>
                    new CycleRepositoryError({
                      message: 'Failed to validate feeling from database',
                      cause: error,
                    }),
                ),
              ),
            ),
          );
        }).pipe(Effect.annotateLogs({ repository: 'CycleRepository' })),

      updateCycleFeelings: (cycleId: string, feelings: FastingFeeling[]) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              // Delete existing feelings for this cycle
              yield* drizzle
                .delete(cycleFeelingsTable)
                .where(eq(cycleFeelingsTable.cycleId, cycleId))
                .pipe(
                  Effect.tapError((error) => Effect.logError('Database error in updateCycleFeelings (delete)', error)),
                );

              // If no feelings to insert, return empty array
              if (feelings.length === 0) {
                return [];
              }

              // Insert new feelings
              const insertResults = yield* drizzle
                .insert(cycleFeelingsTable)
                .values(feelings.map((feeling) => ({ cycleId, feeling })))
                .returning({ feeling: cycleFeelingsTable.feeling });

              return yield* Effect.all(
                insertResults.map((result) =>
                  S.decodeUnknown(FastingFeelingSchema)(result.feeling).pipe(
                    Effect.mapError(
                      (error) =>
                        new CycleRepositoryError({
                          message: 'Failed to validate feeling from database',
                          cause: error,
                        }),
                    ),
                  ),
                ),
              );
            }),
          )
          .pipe(
            Effect.mapError((error) => {
              // Check for the trigger's check constraint violation (max feelings per cycle)
              const cause = (error as { cause?: { code?: string } }).cause;
              if (cause?.code === '23514') {
                return new FeelingsLimitExceededError({
                  message: `A cycle cannot have more than ${MAX_FEELINGS_PER_CYCLE} feelings`,
                  cycleId,
                  currentCount: MAX_FEELINGS_PER_CYCLE,
                });
              }

              return new CycleRepositoryError({
                message: 'Failed to update feelings in database',
                cause: error,
              });
            }),
            Effect.tapError((error) => Effect.logError('Database error in updateCycleFeelings', error)),
            Effect.annotateLogs({ repository: 'CycleRepository' }),
          ),
    };

    return repository;
  }),
  accessors: true,
}) {}
