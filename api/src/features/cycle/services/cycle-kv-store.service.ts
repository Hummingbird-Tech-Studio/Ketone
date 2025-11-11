import { Effect, Layer, Option, Schema as S } from 'effect';
import { KeyValueStore } from '@effect/platform';
import { BunKeyValueStore } from '@effect/platform-bun';
import { type CycleRecord } from '../repositories';

/**
 * Error type for CycleKVStore operations
 */
export class CycleKVStoreError extends S.TaggedError<CycleKVStoreError>()('CycleKVStoreError', {
  message: S.String,
  cause: S.Unknown,
}) {}

/**
 * Schema for serializing CycleRecord to/from KeyValueStore
 * Uses DateFromString to properly serialize Date objects
 */
const CycleRecordKVSchema = S.Struct({
  id: S.String,
  userId: S.String,
  status: S.Literal('InProgress', 'Completed'),
  startDate: S.DateFromString,
  endDate: S.DateFromString,
  createdAt: S.DateFromString,
  updatedAt: S.DateFromString,
});

/**
 * CycleKVStore service for managing in-progress cycles in memory with file persistence.
 *
 * Uses @effect/platform KeyValueStore with file system backing for:
 * - Fast in-memory access to active cycles
 * - Persistence across server restarts
 * - Automatic serialization/deserialization of cycle data
 *
 * Storage structure:
 * - Key: `cycle:inProgress:{userId}`
 * - Value: Serialized CycleRecord
 */
export class CycleKVStore extends Effect.Service<CycleKVStore>()('CycleKVStore', {
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore.KeyValueStore;
    const store = kv.forSchema(CycleRecordKVSchema);

    const makeKey = (userId: string) => `cycle:inProgress:${userId}`;

    return {
      /**
       * Get the in-progress cycle for a user
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves to Option<CycleRecord> - Some if found, None if not found
       */
      getInProgressCycle: (userId: string): Effect.Effect<Option.Option<CycleRecord>, CycleKVStoreError> =>
        Effect.gen(function* () {
          const key = makeKey(userId);

          return yield* store.get(key).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `[CycleKVStore] Failed to get in-progress cycle for user ${userId}: ${error.message}`,
                );

                return yield* Effect.fail(
                  new CycleKVStoreError({
                    message: `Failed to retrieve in-progress cycle for user ${userId}`,
                    cause: error,
                  }),
                );
              }),
            ),
          );
        }),

      /**
       * Set the in-progress cycle for a user
       *
       * @param userId - The ID of the user
       * @param cycle - The cycle record to store
       * @returns Effect that resolves when the cycle is stored
       */
      setInProgressCycle: (userId: string, cycle: CycleRecord): Effect.Effect<void, CycleKVStoreError> =>
        Effect.gen(function* () {
          const key = makeKey(userId);

          yield* store.set(key, cycle).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `[CycleKVStore] Failed to set in-progress cycle for user ${userId}: ${error.message}`,
                );

                return yield* Effect.fail(
                  new CycleKVStoreError({
                    message: `Failed to store in-progress cycle for user ${userId}`,
                    cause: error,
                  }),
                );
              }),
            ),
          );

          yield* Effect.logDebug(`[CycleKVStore] Stored in-progress cycle for user ${userId}`);
        }),

      /**
       * Remove the in-progress cycle for a user (called when cycle is completed)
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves when the cycle is removed
       */
      removeInProgressCycle: (userId: string): Effect.Effect<void, CycleKVStoreError> =>
        Effect.gen(function* () {
          const key = makeKey(userId);

          yield* kv.remove(key).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `[CycleKVStore] Failed to remove in-progress cycle for user ${userId}: ${error.message}`,
                );

                return yield* Effect.fail(
                  new CycleKVStoreError({
                    message: `Failed to remove in-progress cycle for user ${userId}`,
                    cause: error,
                  }),
                );
              }),
            ),
          );

          yield* Effect.logDebug(`[CycleKVStore] Removed in-progress cycle for user ${userId}`);
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Storage path for cycle KeyValueStore data
 */
export const CYCLE_KV_STORAGE_PATH = '.data/cycles';

/**
 * Layer for CycleKVStore with file system persistence
 *
 * Note: Requires custom layer configuration to provide BunKeyValueStore
 * infrastructure layer with file system backing. This is different from
 * business logic services that only depend on other services.
 *
 * Storage location: /api/.data/cycles/
 */
export const CycleKVStoreLive = Layer.provide(
  CycleKVStore.Default,
  BunKeyValueStore.layerFileSystem(CYCLE_KV_STORAGE_PATH),
);
