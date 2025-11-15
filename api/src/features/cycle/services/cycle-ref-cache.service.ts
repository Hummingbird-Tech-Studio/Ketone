import { Data, Effect, Option, Ref } from 'effect';
import { type CycleRecord, CycleRepository } from '../repositories';

export class CycleRefCacheError extends Data.TaggedError('CycleRefCacheError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * CycleRefCache service for managing in-progress cycles in memory.
 *
 * Uses Effect Ref for:
 * - Fast in-memory access to active cycles
 * - Automatic population from PostgreSQL on first access
 * - Manual invalidation for cache management
 *
 * Storage structure:
 * - Map<userId, Ref<Option<CycleRecord>>>
 * - Each user has their own Ref containing their in-progress cycle
 */
export class CycleRefCache extends Effect.Service<CycleRefCache>()('CycleRefCache', {
  effect: Effect.gen(function* () {
    const cycleRepository = yield* CycleRepository;
    const userCaches = new Map<string, Ref.Ref<Option.Option<CycleRecord>>>();

    /**
     * Get or create a Ref for a given user
     * Initializes with data from PostgreSQL on first access
     */
    const getOrCreateRef = (userId: string) =>
      Effect.gen(function* () {
        const existingRef = userCaches.get(userId);
        if (existingRef) {
          return existingRef;
        }

        yield* Effect.logInfo(`[CycleRefCache] Creating new Ref for user ${userId}`);

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
            Effect.logInfo(`[CycleRefCache] Initial load from DB for user ${userId}: cycle ${cycle.id}`),
        });

        const ref = yield* Ref.make(activeCycleOption);
        userCaches.set(userId, ref);

        return ref;
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
          const ref = yield* getOrCreateRef(userId);
          const cycleOption = yield* Ref.get(ref);

          if (Option.isNone(cycleOption)) {
            yield* Effect.logDebug(`[CycleRefCache] User ${userId} has no in-progress cycle (Option.none)`);
            return Option.none<CycleRecord>();
          }

          yield* Effect.logDebug(`[CycleRefCache] Cache hit for user ${userId}: cycle ${cycleOption.value.id}`);

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

          const ref = yield* getOrCreateRef(userId);
          yield* Ref.set(ref, Option.some(cycle));

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

          // Remove from map to free memory
          userCaches.delete(userId);

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

          userCaches.delete(userId);
        }),

      /**
       * Invalidate all cache entries
       */
      invalidateAll: () =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleRefCache] Invalidating entire cache`);
          userCaches.clear();
        }),
    };
  }),
  dependencies: [CycleRepository.Default],
  accessors: true,
}) {}
