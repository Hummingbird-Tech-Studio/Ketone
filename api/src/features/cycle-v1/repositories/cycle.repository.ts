import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Option, Schema as S } from 'effect';
import { cyclesTable } from '../../../db';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, CycleRecordSchema } from './schemas';
import { and, eq } from 'drizzle-orm';

export class CycleRepository extends Effect.Service<CycleRepository>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
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
                // Helper function to check if an object is a constraint violation
                const isConstraintViolation = (err: any): boolean => {
                  return (
                    typeof err === 'object' &&
                    err !== null &&
                    'code' in err &&
                    err.code === '23505' &&
                    'constraint' in err &&
                    err.constraint === 'idx_cycles_user_active'
                  );
                };

                // Check direct access paths first (most common with @effect/sql)
                const errorPaths = [
                  (error as any)?.cause?.cause?.cause, // Level 3 (most common)
                  (error as any)?.cause?.cause, // Level 2
                  (error as any)?.cause, // Level 1
                  error, // Level 0
                ];

                for (const err of errorPaths) {
                  if (isConstraintViolation(err)) {
                    return new CycleAlreadyInProgressError({
                      message: 'User already has a cycle in progress',
                      userId: data.userId,
                    });
                  }
                }

                // Fallback: recursive check for any other nesting
                const checkRecursive = (err: any, depth = 0): boolean => {
                  if (depth > 10) return false; // Prevent infinite loops
                  if (isConstraintViolation(err)) return true;
                  if (err && typeof err === 'object' && 'cause' in err) {
                    return checkRecursive(err.cause, depth + 1);
                  }
                  return false;
                };

                if (checkRecursive(error)) {
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
              and(
                eq(cyclesTable.id, cycleId),
                eq(cyclesTable.userId, userId),
                eq(cyclesTable.status, 'InProgress'),
              ),
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
            .set({ status: 'Completed', startDate, endDate })
            .where(
              and(
                eq(cyclesTable.id, cycleId),
                eq(cyclesTable.userId, userId),
                eq(cyclesTable.status, 'InProgress'),
              ),
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
                message: 'Cannot complete a cycle that is not in progress',
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
    };
  }),
  accessors: true,
}) {}
