import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Array, Effect, Option, Schema as S } from 'effect';
import { cyclesTable } from '../../../db';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, CycleRecordSchema } from './schemas';
import { and, desc, eq } from 'drizzle-orm';
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
                // Check for PostgreSQL unique constraint violation (error code 23505)
                const isConstraintViolation = (err: unknown): boolean =>
                  typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

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

                const constraintViolation = Array.findFirst(causeChain, isConstraintViolation);

                return Option.match(constraintViolation, {
                  onNone: () =>
                    new CycleRepositoryError({
                      message: 'Failed to create cycle in database',
                      cause: error,
                    }),
                  onSome: () =>
                    new CycleAlreadyInProgressError({
                      message: 'User already has a cycle in progress',
                      userId: data.userId,
                    }),
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
            .set({ status: 'Completed', startDate, endDate })
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

    return repository;
  }),
  accessors: true,
}) {}
