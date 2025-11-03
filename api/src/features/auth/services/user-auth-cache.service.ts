import { Cache, Data, Duration, Effect, Layer } from 'effect';
import { UserRepository } from '../repositories';

export class UserAuthCacheError extends Data.TaggedError('UserAuthCacheError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * UserAuth Cache Service - In-memory cache for password change tracking
 *
 * Business Logic:
 * - Stores Unix timestamp (seconds) of when password was last changed
 * - If passwordChangedAt is null, uses createdAt as baseline
 * - Token is valid if: tokenIssuedAt >= passwordChangedAt
 * - Stale timestamp protection: ignores timestamps older than current value
 *
 * Cache Configuration:
 * - Capacity: 50,000 users
 * - TTL: 24 hours
 * - Lookup: Fetches from database on cache miss
 */
export class UserAuthCache extends Effect.Service<UserAuthCache>()('UserAuthCache', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;

    // Create cache with automatic DB lookup on miss
    const cache = yield* Cache.make<string, number, UserAuthCacheError>({
      capacity: 50_000,
      timeToLive: Duration.hours(24),
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
          const timestampSeconds = Math.floor(timestamp.getTime() / 1000);

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
            Effect.catchAll(() => Effect.succeed(0)), // If not in cache or error, treat as 0
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
    };
  }),
  accessors: true,
}) {}

export const UserAuthCacheLive = UserAuthCache.Default.pipe(Layer.provide(UserRepository.Default));
