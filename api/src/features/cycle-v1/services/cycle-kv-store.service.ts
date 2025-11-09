import { Effect, Layer, Option, Schema as S } from 'effect';
import { KeyValueStore } from '@effect/platform';
import { BunKeyValueStore } from '@effect/platform-bun';
import { CycleRecordSchema, type CycleRecord } from '../repositories';

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

      /**
       * Check if a user has an in-progress cycle
       *
       * @deprecated This method is no longer used. The "one InProgress cycle per user" constraint
       * is now enforced by PostgreSQL's partial unique index (idx_cycles_user_active).
       * The constraint violation will be caught when attempting to create a cycle in Postgres.
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves to true if the user has an in-progress cycle, false otherwise
       */
      hasInProgressCycle: (userId: string): Effect.Effect<boolean, CycleKVStoreError> =>
        Effect.gen(function* () {
          const key = makeKey(userId);

          return yield* kv.has(key).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(
                  `[CycleKVStore] Failed to check in-progress cycle for user ${userId}: ${error.message}`,
                );

                return yield* Effect.fail(
                  new CycleKVStoreError({
                    message: `Failed to check in-progress cycle for user ${userId}`,
                    cause: error,
                  }),
                );
              }),
            ),
          );
        }),

      /**
       * Get all in-progress cycles (useful for recovery/debugging)
       *
       * @returns Effect that resolves to an array of all in-progress cycles
       */
      getAllInProgressCycles: (): Effect.Effect<CycleRecord[], CycleKVStoreError> =>
        Effect.gen(function* () {
          // Note: KeyValueStore doesn't have a native "list all keys" method
          // This would require maintaining a separate index or iterating all keys
          // For now, we'll return an empty array and log a warning
          yield* Effect.logWarning(
            '[CycleKVStore] getAllInProgressCycles not fully implemented - requires key iteration support',
          );

          return [];
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Layer for CycleKVStore with file system persistence
 *
 * Storage location: /api/.data/cycles/
 */
export const CycleKVStoreLive = Layer.provide(
  CycleKVStore.Default,
  BunKeyValueStore.layerFileSystem('.data/cycles'),
);
