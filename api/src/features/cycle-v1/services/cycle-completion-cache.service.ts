import { Cache, Data, Duration, Effect, Layer, Option } from 'effect';
import { CycleRepository } from '../repositories';

export class CycleCompletionCacheError extends Data.TaggedError('CycleCompletionCacheError')<{
  message: string;
  cause?: unknown;
}> {}

const CACHE_CAPACITY = 10_000;
const CACHE_TTL_HOURS = 24;
const TIMESTAMP_SENTINEL = 0;

export class CycleCompletionCache extends Effect.Service<CycleCompletionCache>()('CycleCompletionCache', {
  effect: Effect.gen(function* () {
    const cycleRepository = yield* CycleRepository;

    const cache = yield* Cache.make<string, number, CycleCompletionCacheError>({
      capacity: CACHE_CAPACITY,
      timeToLive: Duration.hours(CACHE_TTL_HOURS),
      lookup: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleCompletionCache] Cache miss for user ${userId}, fetching from database`);

          const lastCompletedOption = yield* cycleRepository.getLastCompletedCycle(userId).pipe(
            Effect.mapError(
              (error) =>
                new CycleCompletionCacheError({
                  message: 'Failed to fetch last completed cycle from database',
                  cause: error,
                }),
            ),
          );

          if (Option.isNone(lastCompletedOption)) {
            yield* Effect.logInfo(
              `[CycleCompletionCache] No completed cycles found for user ${userId}, storing sentinel value`,
            );
            return TIMESTAMP_SENTINEL;
          }

          const lastCompleted = lastCompletedOption.value;
          const timestamp = Math.floor(lastCompleted.endDate.getTime() / 1000);

          yield* Effect.logInfo(
            `[CycleCompletionCache] Loaded completion date for user ${userId}: ${new Date(timestamp * 1000).toISOString()}`,
          );

          return timestamp;
        }),
    });

    return {
      /**
       * Get the last completion date from cache (or database on cache miss)
       *
       * @param userId - User ID to lookup
       * @returns Option containing the last completion date, or None if user has no completed cycles
       */
      getLastCompletionDate: (userId: string) =>
        Effect.gen(function* () {
          const timestamp = yield* cache.get(userId);

          if (timestamp === TIMESTAMP_SENTINEL) {
            yield* Effect.logDebug(`[CycleCompletionCache] User ${userId} has no completed cycles (sentinel value)`);
            return Option.none<Date>();
          }

          const date = new Date(timestamp * 1000);
          yield* Effect.logDebug(`[CycleCompletionCache] Cache hit for user ${userId}: ${date.toISOString()}`);

          return Option.some(date);
        }),

      /**
       * Update cache with new completion date (called after completing a cycle)
       *
       * @param userId - User ID
       * @param endDate - End date of the completed cycle
       * @returns The endDate that was set
       */
      setLastCompletionDate: (userId: string, endDate: Date) =>
        Effect.gen(function* () {
          const timestamp = Math.floor(endDate.getTime() / 1000);

          yield* Effect.logInfo(
            `[CycleCompletionCache] Updating cache for user ${userId} with completion date: ${endDate.toISOString()}`,
          );

          yield* cache.set(userId, timestamp);

          return endDate;
        }),

      /**
       * Invalidate cache entry for a user
       * Useful if a completed cycle is deleted or modified
       *
       * @param userId - User ID to invalidate
       */
      invalidate: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleCompletionCache] Invalidating cache for user ${userId}`);
          yield* cache.invalidate(userId);
        }),

      /**
       * Invalidate all cache entries
       * Useful for maintenance or testing scenarios
       */
      invalidateAll: () =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleCompletionCache] Invalidating entire cache`);
          yield* cache.invalidateAll;
        }),
    };
  }),
  accessors: true,
}) {}

export const CycleCompletionCacheLive = CycleCompletionCache.Default.pipe(Layer.provide(CycleRepository.Default));
