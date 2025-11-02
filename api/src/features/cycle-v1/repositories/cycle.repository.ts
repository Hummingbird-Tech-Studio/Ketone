import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Option, Schema as S } from 'effect';
import { cyclesTable } from '../../../db';
import { CycleRepositoryError } from './errors';
import { type CycleData, CycleRecordSchema } from './schemas';
import { and, eq } from 'drizzle-orm';

export class CycleRepository extends Effect.Service<CycleRepository>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      getCycleById: (cycleId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(cyclesTable)
            .where(eq(cyclesTable.id, cycleId))
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

      updateCycleDates: (cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .update(cyclesTable)
            .set({ startDate, endDate })
            .where(eq(cyclesTable.id, cycleId))
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

      completeCycle: (cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .update(cyclesTable)
            .set({ status: 'Completed', startDate, endDate })
            .where(eq(cyclesTable.id, cycleId))
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
    };
  }),
  accessors: true,
}) {}
