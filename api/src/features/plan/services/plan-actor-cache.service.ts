import { Effect, Option, SynchronizedRef } from 'effect';
import { type PlanWithPeriodsRecord } from '../repositories/schemas';
import { PlanActorCacheError } from '../domain';
import { PlanSchemaStore, createPlanKey, type PlanKVRecord } from './plan-kv-store';

/**
 * PlanActorCache service for managing active plans in memory with KeyValueStore backing.
 *
 * Uses:
 * - SynchronizedRef<Map<string, PlanWithPeriodsRecord>> for thread-safe in-memory state
 * - SchemaStore (file-system backed) for durability across restarts
 *
 * Flow:
 * - Create/Update: Write to KeyValueStore first, then update memory
 * - Read: Check memory first, fallback to KeyValueStore
 * - Remove: Remove from KeyValueStore, then clear memory
 */
export class PlanActorCache extends Effect.Service<PlanActorCache>()('PlanActorCache', {
  effect: Effect.gen(function* () {
    const schemaStore = yield* PlanSchemaStore.tag;

    // In-memory cache: userId -> PlanWithPeriodsRecord
    const memoryCache = yield* SynchronizedRef.make(new Map<string, PlanWithPeriodsRecord>());

    yield* Effect.logInfo('PlanActorCache initialized - plans will be loaded on-demand from KeyValueStore');

    const toKVRecord = (plan: PlanWithPeriodsRecord): PlanKVRecord => ({
      ...plan,
      cachedAt: new Date(),
    });

    const fromKVRecord = (kvRecord: PlanKVRecord): PlanWithPeriodsRecord => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cachedAt, ...plan } = kvRecord;
      return plan;
    };

    return {
      /**
       * Get the active plan for a user.
       * Checks memory first, then KeyValueStore.
       */
      getActivePlan: (userId: string): Effect.Effect<Option.Option<PlanWithPeriodsRecord>, PlanActorCacheError> =>
        Effect.gen(function* () {
          // Check memory cache first
          const cache = yield* SynchronizedRef.get(memoryCache);
          const memoryPlan = cache.get(userId);

          if (memoryPlan) {
            yield* Effect.logDebug(`Cache hit for user ${userId}: plan ${memoryPlan.id}`);
            return Option.some(memoryPlan);
          }

          // Cache miss - check KeyValueStore
          yield* Effect.logDebug(`Cache miss for user ${userId}, checking KeyValueStore`);

          const kvPlanOption = yield* schemaStore.get(createPlanKey(userId)).pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to get plan from KeyValueStore',
                  cause: error,
                }),
            ),
          );

          if (Option.isSome(kvPlanOption)) {
            const plan = fromKVRecord(kvPlanOption.value);

            // Populate memory cache
            yield* SynchronizedRef.update(memoryCache, (cache) => {
              const newCache = new Map(cache);
              newCache.set(userId, plan);
              return newCache;
            });

            yield* Effect.logInfo(`Loaded plan ${plan.id} from KeyValueStore for user ${userId}`);
            return Option.some(plan);
          }

          yield* Effect.logDebug(`No active plan found for user ${userId}`);
          return Option.none();
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Set the active plan for a user.
       * Writes to KeyValueStore first, then updates memory.
       */
      setActivePlan: (userId: string, plan: PlanWithPeriodsRecord): Effect.Effect<void, PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Setting active plan ${plan.id} for user ${userId}`);

          // Write to KeyValueStore first (durability)
          yield* schemaStore.set(createPlanKey(userId), toKVRecord(plan)).pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to save plan to KeyValueStore',
                  cause: error,
                }),
            ),
          );

          // Update memory cache
          yield* SynchronizedRef.update(memoryCache, (cache) => {
            const newCache = new Map(cache);
            newCache.set(userId, plan);
            return newCache;
          });

          yield* Effect.logDebug(`Plan ${plan.id} saved to cache for user ${userId}`);
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Update the active plan for a user.
       * Same as setActivePlan but with update semantics in logging.
       */
      updateActivePlan: (userId: string, plan: PlanWithPeriodsRecord): Effect.Effect<void, PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating plan ${plan.id} for user ${userId}`);

          // Write to KeyValueStore first (durability)
          yield* schemaStore.set(createPlanKey(userId), toKVRecord(plan)).pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to update plan in KeyValueStore',
                  cause: error,
                }),
            ),
          );

          // Update memory cache
          yield* SynchronizedRef.update(memoryCache, (cache) => {
            const newCache = new Map(cache);
            newCache.set(userId, plan);
            return newCache;
          });

          yield* Effect.logDebug(`Plan ${plan.id} updated in cache for user ${userId}`);
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Remove the active plan for a user.
       * Called after persisting to PostgreSQL on completion/cancellation.
       */
      removeActivePlan: (userId: string): Effect.Effect<void, PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Removing active plan for user ${userId}`);

          // Remove from KeyValueStore
          yield* schemaStore.remove(createPlanKey(userId)).pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to remove plan from KeyValueStore',
                  cause: error,
                }),
            ),
          );

          // Remove from memory cache
          yield* SynchronizedRef.update(memoryCache, (cache) => {
            const newCache = new Map(cache);
            newCache.delete(userId);
            return newCache;
          });

          yield* Effect.logDebug(`Plan removed from cache for user ${userId}`);
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Check if user has an active plan in cache.
       */
      hasActivePlan: (userId: string): Effect.Effect<boolean, PlanActorCacheError> =>
        Effect.gen(function* () {
          // Check memory first
          const cache = yield* SynchronizedRef.get(memoryCache);
          if (cache.has(userId)) {
            return true;
          }

          // Check KeyValueStore
          return yield* schemaStore.has(createPlanKey(userId)).pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to check plan existence in KeyValueStore',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Invalidate cache entry for a user.
       * Removes from memory but keeps in KeyValueStore.
       */
      invalidate: (userId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Invalidating cache for user ${userId}`);
          yield* SynchronizedRef.update(memoryCache, (cache) => {
            const newCache = new Map(cache);
            newCache.delete(userId);
            return newCache;
          });
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Invalidate all cache entries.
       * Clears memory but keeps KeyValueStore.
       */
      invalidateAll: (): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Invalidating entire cache');
          yield* SynchronizedRef.set(memoryCache, new Map());
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),

      /**
       * Clear everything including KeyValueStore.
       * Use with caution - for testing or cleanup scenarios.
       */
      clearAll: (): Effect.Effect<void, PlanActorCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Clearing all plans from cache and KeyValueStore');

          yield* schemaStore.clear.pipe(
            Effect.mapError(
              (error) =>
                new PlanActorCacheError({
                  message: 'Failed to clear KeyValueStore',
                  cause: error,
                }),
            ),
          );

          yield* SynchronizedRef.set(memoryCache, new Map());
        }).pipe(Effect.annotateLogs({ service: 'PlanActorCache' })),
    };
  }),
  dependencies: [],
  accessors: true,
}) {}
