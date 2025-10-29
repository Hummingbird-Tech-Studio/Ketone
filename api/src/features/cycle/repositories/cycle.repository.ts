import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Layer, Schema as S } from 'effect';
import { cyclesTable, orleansStorageTable, DatabaseLive } from '../../../db';
import { CycleRepositoryError } from './errors';
import { type CycleData, CycleRecordSchema } from './schemas';
import { eq } from 'drizzle-orm';

// ============================================================================
// Service Implementation using Effect.Service
// ============================================================================

/**
 * CycleRepository Service - Manages cycle database operations with Effect
 */
export class CycleRepository extends Effect.Service<CycleRepository>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      createCycle: (data: CycleData) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .insert(cyclesTable)
            .values({
              actorId: data.actorId,
              startDate: data.startDate, // Already Date object from actor
              endDate: data.endDate, // Already Date object from actor
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

      /**
       * Delete cycles for a specific actor ID
       * Used for test cleanup - only deletes cycles for explicitly tracked test users
       */
      deleteCyclesByActorId: (actorId: string) =>
        Effect.gen(function* () {
          return yield* drizzle
            .delete(cyclesTable)
            .where(eq(cyclesTable.actorId, actorId))
            .pipe(
              Effect.tapError((error) => Effect.logError(`❌ Failed to delete cycles for ${actorId}`, error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: `Failed to delete cycles for actor ${actorId}`,
                  cause: error,
                });
              }),
            );
        }),

      /**
       * Delete Orleans storage entry for a specific actor ID
       * This removes actor state from the Orleans persistence table
       */
      deleteOrleansStorageByActorId: (actorId: string) =>
        Effect.gen(function* () {
          return yield* drizzle
            .delete(orleansStorageTable)
            .where(eq(orleansStorageTable.grainIdExtensionString, actorId))
            .pipe(
              Effect.tapError((error) => Effect.logError(`❌ Failed to delete Orleans storage for ${actorId}`, error)),
              Effect.mapError((error) => {
                return new CycleRepositoryError({
                  message: `Failed to delete Orleans storage for actor ${actorId}`,
                  cause: error,
                });
              }),
            );
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Effect program to create a cycle
 */
export const programCreateCycle = (data: { actorId: string; startDate: Date; endDate: Date }) =>
  Effect.gen(function* () {
    const repository = yield* CycleRepository;
    return yield* repository.createCycle(data);
  }).pipe(Effect.provide(CycleRepository.Default.pipe(Layer.provide(DatabaseLive))));

/**
 * Bridge an Effect’s success/error channels to UI callbacks.
 *
 * Generic over:
 *   • A – success value
 *   • E – error value  (inferred from `eff`)
 *
 * Works for any `Effect` whose environment is already satisfied (`R = never`).
 */
export function runWithUi<A, E>(
  eff: Effect.Effect<A, E>,
  onSuccess: (value: A) => void,
  onFailure: (error: E) => void,
): Promise<void> {
  const handled: Effect.Effect<void, never> = eff.pipe(
    Effect.matchEffect({
      onSuccess: (value) => Effect.sync(() => onSuccess(value)), // pass value to UI
      onFailure: (err) => Effect.sync(() => onFailure(err)),
    }),
  );

  return Effect.runPromise(handled);
}
