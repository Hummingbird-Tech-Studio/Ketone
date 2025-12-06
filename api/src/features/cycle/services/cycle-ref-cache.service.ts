import { Cache, Data, Duration, Effect, Option } from 'effect';
import { type CycleRecord, CycleRepository } from '../repositories';

export class CycleRefCacheError extends Data.TaggedError('CycleRefCacheError')<{
  message: string;
  cause?: unknown;
}> {}

const CACHE_CAPACITY = 10_000;
const CACHE_TTL_MINUTES = 30;

/**
 * CycleRefCache service for managing in-progress cycles in memory.
 *
 * Uses Effect.Cache for:
 * - Fast in-memory access to active cycles
 * - Automatic population from PostgreSQL on cache miss
 * - TTL-based eviction (30 minutes) for idle cycles
 * - Capacity limits (10,000 entries) with LRU eviction
 *
 * When TTL expires, the cycle is removed from memory but remains in PostgreSQL.
 * On next access, the lookup function reloads from DB.
 */
export class CycleRefCache extends Effect.Service<CycleRefCache>()('CycleRefCache', {
  effect: Effect.gen(function* () {
    const cycleRepository = yield* CycleRepository;

    const cache = yield* Cache.make<string, Option.Option<CycleRecord>, CycleRefCacheError>({
      capacity: CACHE_CAPACITY,
      timeToLive: Duration.minutes(CACHE_TTL_MINUTES),
      lookup: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Cache miss for user ${userId}, fetching from DB`);

          const activeCycleOption = yield* cycleRepository.getActiveCycle(userId).pipe(
            Effect.mapError(
              (error) =>
                new CycleRefCacheError({
                  message: 'Failed to fetch active cycle from database',
                  cause: error,
                }),
            ),
          );

          yield* Option.match(activeCycleOption, {
            onNone: () => Effect.logInfo(`[CycleRefCache] No active cycle found for user ${userId}`),
            onSome: (cycle) =>
              Effect.logInfo(`[CycleRefCache] Loaded from DB for user ${userId}: cycle ${cycle.id}`),
          });

          return activeCycleOption;
        }),
    });

    return {
      /**
       * Get the in-progress cycle for a user
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves to Option<CycleRecord> - Some if found, None if not found
       */
      getInProgressCycle: (userId: string): Effect.Effect<Option.Option<CycleRecord>, CycleRefCacheError> =>
        Effect.gen(function* () {
          const cycleOption = yield* cache.get(userId);

          yield* Option.match(cycleOption, {
            onNone: () => Effect.logDebug(`[CycleRefCache] User ${userId} has no in-progress cycle`),
            onSome: (cycle) =>
              Effect.logDebug(`[CycleRefCache] Cache hit for user ${userId}: cycle ${cycle.id}`),
          });

          return cycleOption;
        }),

      /**
       * Set the in-progress cycle for a user
       *
       * @param userId - The ID of the user
       * @param cycle - The cycle record to store
       * @returns Effect that resolves when the cycle is stored
       */
      setInProgressCycle: (userId: string, cycle: CycleRecord): Effect.Effect<void, CycleRefCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Setting in-progress cycle for user ${userId}: cycle ${cycle.id}`);

          yield* cache.set(userId, Option.some(cycle));

          yield* Effect.logDebug(`[CycleRefCache] Successfully set in-progress cycle for user ${userId}`);
        }),

      /**
       * Remove the in-progress cycle for a user
       * Called as part of business logic when a cycle is completed
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves when the cycle is removed
       */
      removeInProgressCycle: (userId: string): Effect.Effect<void, CycleRefCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Removing in-progress cycle for user ${userId} (cycle completed)`);

          yield* cache.invalidate(userId);

          yield* Effect.logDebug(`[CycleRefCache] Successfully removed in-progress cycle for user ${userId}`);
        }),

      /**
       * Invalidate cache entry for a user
       * Removes from in-memory cache to force fresh fetch from database on next access
       * Used for debugging, testing, or error recovery scenarios
       *
       * @param userId - User ID to invalidate
       */
      invalidate: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Invalidating cache for user ${userId}`);
          yield* cache.invalidate(userId);
        }),

      /**
       * Invalidate all cache entries
       */
      invalidateAll: () =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Invalidating entire cache`);
          yield* cache.invalidateAll;
        }),
    };
  }),
  dependencies: [CycleRepository.Default],
  accessors: true,
}) {}
