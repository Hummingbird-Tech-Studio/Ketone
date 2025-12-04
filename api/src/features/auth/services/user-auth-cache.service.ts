import { Cache, Data, Duration, Effect } from 'effect';
import { getUnixTime } from 'date-fns';
import { UserRepository } from '../repositories';

export class UserAuthCacheError extends Data.TaggedError('UserAuthCacheError')<{
  message: string;
  cause?: unknown;
}> {}

const CACHE_CAPACITY = 50_000;
const CACHE_TTL_HOURS = 24;
const TIMESTAMP_SENTINEL = 0;

export class UserAuthCache extends Effect.Service<UserAuthCache>()('UserAuthCache', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const cache = yield* Cache.make<string, number, UserAuthCacheError>({
      capacity: CACHE_CAPACITY,
      timeToLive: Duration.hours(CACHE_TTL_HOURS),
      lookup: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthCache] Cache miss for user ${userId}, fetching from DB`);

          const user = yield* userRepository.findUserByIdWithPassword(userId).pipe(
            Effect.mapError(
              (error) =>
                new UserAuthCacheError({
                  message: 'Failed to fetch user from database',
                  cause: error,
                }),
            ),
          );

          if (!user) {
            yield* Effect.logWarning(`[UserAuthCache] User ${userId} not found in database`);
            return yield* Effect.fail(
              new UserAuthCacheError({
                message: `User ${userId} not found`,
              }),
            );
          }

          // Use passwordChangedAt if available, otherwise use createdAt as baseline
          const timestamp = user.passwordChangedAt ?? user.createdAt;
          const timestampSeconds = getUnixTime(timestamp);

          yield* Effect.logInfo(
            `[UserAuthCache] Loaded timestamp for user ${userId}: ${timestampSeconds} (${timestamp.toISOString()})`,
          );

          return timestampSeconds;
        }),
    });

    return {
      setPasswordChangedAt: (userId: string, timestamp: number) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthCache] Setting password changed timestamp for user ${userId}: ${timestamp}`);

          const currentTimestamp = yield* cache.get(userId).pipe(
            Effect.catchAll(() => Effect.succeed(TIMESTAMP_SENTINEL)), // If not in cache or error, use sentinel
          );

          if (timestamp < currentTimestamp) {
            yield* Effect.logWarning(
              `[UserAuthCache] Ignoring stale timestamp ${timestamp} (current: ${currentTimestamp}) for user ${userId}`,
            );
            return currentTimestamp;
          }

          yield* cache.set(userId, timestamp);

          yield* Effect.logInfo(`[UserAuthCache] ✅ Password changed timestamp set successfully for user ${userId}`);

          return timestamp;
        }),

      validateToken: (userId: string, tokenIssuedAt: number) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthCache] Validating token for user ${userId} (iat=${tokenIssuedAt})`);

          const passwordChangedAt = yield* cache.get(userId).pipe(
            Effect.mapError(
              (error) =>
                new UserAuthCacheError({
                  message: 'Failed to get password change timestamp',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`[UserAuthCache] User ${userId} passwordChangedAt: ${passwordChangedAt}`);

          const isValid = tokenIssuedAt >= passwordChangedAt;

          yield* Effect.logInfo(
            `[UserAuthCache] ✅ Token validation completed for user ${userId}: ${isValid ? 'VALID' : 'INVALID'}`,
          );

          return isValid;
        }),

      invalidate: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthCache] Invalidating cache for user ${userId}`);
          yield* cache.invalidate(userId);
          yield* Effect.logInfo(`[UserAuthCache] ✅ Cache invalidated for user ${userId}`);
        }),
    };
  }),
  dependencies: [UserRepository.Default],
  accessors: true,
}) {}
