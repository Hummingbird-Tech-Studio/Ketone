import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Array, Effect, Option, Schema as S } from 'effect';
import { cyclesTable } from '../../../db';
import { CycleRepositoryError } from './errors';
import { CycleAlreadyInProgressError, CycleInvalidStateError } from '../domain';
import { type CycleData, CycleRecordSchema } from './schemas';
import { and, asc, desc, eq, gt, lt, lte, ne, or } from 'drizzle-orm';
import type { ICycleRepository } from './cycle.repository.interface';

export class CycleRepositoryPostgres extends Effect.Service<CycleRepositoryPostgres>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    const repository: ICycleRepository = {
      getCycleById: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in getCycleById', error)),
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
        }),

      getActiveCycle: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')))
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in getActiveCycle', error)),
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
        }),

      getLastCompletedCycle: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(and(eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'Completed')))
            .orderBy(desc(cyclesTable.endDate))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in getLastCompletedCycle', error)),
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
        }),

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
              Effect.tapError((error) => Effect.logError('❌ Database error in getPreviousCycle', error)),
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
        }),

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
              Effect.tapError((error) => Effect.logError('❌ Database error in getNextCycle', error)),
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
        }),

      createCycle: (data: CycleData) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .insert(cyclesTable)
            .values({
              userId: data.userId,
              status: data.status,
              startDate: data.startDate,
              endDate: data.endDate,
            })
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in createCycle', error)),
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
        }),

      updateCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({ startDate, endDate })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in updateCycleDates', error)),
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
        }),

      completeCycle: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({
              status: 'Completed',
              startDate,
              endDate,
            })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'InProgress')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in completeCycle', error)),
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
        }),

      updateCompletedCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .update(cyclesTable)
            .set({ startDate, endDate })
            .where(
              and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId), eq(cyclesTable.status, 'Completed')),
            )
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in updateCompletedCycleDates', error)),
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
        }),

      deleteCycle: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          yield* drizzle
            .delete(cyclesTable)
            .where(and(eq(cyclesTable.id, cycleId), eq(cyclesTable.userId, userId)))
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in deleteCycle', error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: 'Failed to delete cycle from database',
                  cause: error,
                });
              }),
            );
        }),

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
              Effect.tapError((error) => Effect.logError('❌ Database error in getCyclesByPeriod', error)),
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
        }),
    };

    return repository;
  }),
  accessors: true,
}) {}
