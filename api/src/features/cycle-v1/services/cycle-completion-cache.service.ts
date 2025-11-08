import { Data, Effect, Option, Stream, SubscriptionRef } from 'effect';
import { CycleRepository } from '../repositories';

export class CycleCompletionCacheError extends Data.TaggedError('CycleCompletionCacheError')<{
  message: string;
  cause?: unknown;
}> {}

export class CycleCompletionCache extends Effect.Service<CycleCompletionCache>()('CycleCompletionCache', {
  effect: Effect.gen(function* () {
    const cycleRepository = yield* CycleRepository;

    // Map of userId -> SubscriptionRef for reactive caching
    const userCaches = new Map<string, SubscriptionRef.SubscriptionRef<Option.Option<number>>>();

    /**
     * Get or create a SubscriptionRef for a given user
     * Initializes with data from database on first access
     */
    const getOrCreateSubscription = (userId: string) =>
      Effect.gen(function* () {
        const existingRef = userCaches.get(userId);
        if (existingRef) {
          return existingRef;
        }

        yield* Effect.logInfo(`[CycleCompletionCache] Creating new subscription for user ${userId}`);

        // Fetch initial value from database
        const lastCompletedOption = yield* cycleRepository.getLastCompletedCycle(userId).pipe(
          Effect.mapError(
            (error) =>
              new CycleCompletionCacheError({
                message: 'Failed to fetch last completed cycle from database',
                cause: error,
              }),
          ),
        );

        let initialValue: Option.Option<number>;
        if (Option.isNone(lastCompletedOption)) {
          yield* Effect.logInfo(`[CycleCompletionCache] No completed cycles found for user ${userId}`);
          initialValue = Option.none();
        } else {
          const timestamp = lastCompletedOption.value.endDate.getTime();
          yield* Effect.logInfo(
            `[CycleCompletionCache] Initial load for user ${userId}: ${new Date(timestamp).toISOString()}`,
          );
          initialValue = Option.some(timestamp);
        }

        const subRef = yield* SubscriptionRef.make(initialValue);
        userCaches.set(userId, subRef);

        return subRef;
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
          const subRef = yield* getOrCreateSubscription(userId);
          const timestampOption = yield* SubscriptionRef.get(subRef);

          if (Option.isNone(timestampOption)) {
            yield* Effect.logDebug(`[CycleCompletionCache] User ${userId} has no completed cycles (Option.none)`);
            return Option.none<Date>();
          }

          const timestamp = timestampOption.value;
          const date = new Date(timestamp);
          yield* Effect.logDebug(`[CycleCompletionCache] Cache hit for user ${userId}: ${date.toISOString()}`);

          return Option.some(date);
        }),

      /**
       * Update cache with new completion date (called after completing a cycle OR editing a completed cycle)
       * This will automatically notify all subscribers listening to the changes stream
       *
       * @param userId - User ID
       * @param endDate - End date of the completed cycle
       * @returns The endDate that was set
       */
      setLastCompletionDate: (userId: string, endDate: Date) =>
        Effect.gen(function* () {
          const timestamp = endDate.getTime();

          yield* Effect.logInfo(
            `[CycleCompletionCache] Updating cache for user ${userId} with completion date: ${endDate.toISOString()}`,
          );

          const subRef = yield* getOrCreateSubscription(userId);
          yield* SubscriptionRef.set(subRef, Option.some(timestamp));

          return endDate;
        }),

      /**
       * Invalidate cache entry for a user by refreshing from database
       * Useful if a completed cycle is deleted or modified and we need to reload
       *
       * @param userId - User ID to invalidate
       */
      invalidate: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleCompletionCache] Invalidating cache for user ${userId}`);

          // Remove from map to force fresh fetch on next access
          userCaches.delete(userId);
        }),

      /**
       * Invalidate all cache entries
       * Useful for maintenance or testing scenarios
       */
      invalidateAll: () =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleCompletionCache] Invalidating entire cache`);
          userCaches.clear();
        }),

      /**
       * Subscribe to changes in a user's last completion date
       * Returns a Stream that emits whenever the completion date changes
       *
       * @param userId - User ID to subscribe to
       * @returns Stream of Option<Date> that emits the current value first, then all future changes
       */
      subscribeToChanges: (userId: string) =>
        Effect.gen(function* () {
          const subRef = yield* getOrCreateSubscription(userId);

          // Get current value first
          const currentValue = yield* SubscriptionRef.get(subRef);

          // Create a stream with the current value first, then all future changes
          const currentStream = Stream.make(currentValue);
          const changesStream = subRef.changes;
          const combinedStream = Stream.concat(currentStream, changesStream);

          // Map timestamps to Dates
          return Stream.map(combinedStream, (timestampOption) =>
            Option.map(timestampOption, (timestamp) => new Date(timestamp)),
          );
        }),
    };
  }),
  dependencies: [CycleRepository.Default],
  accessors: true,
}) {}
