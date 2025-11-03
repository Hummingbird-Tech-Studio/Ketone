import { Cache, Data, Duration, Effect, Layer } from 'effect';
import { UserRepository } from '../repositories';

/**
 * UserAuth Cache Service
 *
 * In-memory cache for user password change timestamps to enable fast token validation.
 */

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

          // Fetch user from database
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
      /**
       * Set the password change timestamp for a user
       * This should be called when a user changes their password
       *
       * Implements stale timestamp protection: if newTimestamp is older than
       * the current cached value, it will be ignored (cache is not updated)
       */
      setPasswordChangedAt: (userId: string, timestamp: number) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthCache] Setting password changed timestamp for user ${userId}: ${timestamp}`);

          // Get current timestamp from cache (if exists)
          const currentTimestamp = yield* cache.get(userId).pipe(
            Effect.catchAll(() => Effect.succeed(0)), // If not in cache or error, treat as 0
          );

          // Stale timestamp protection (same as Orleans logic)
          if (timestamp < currentTimestamp) {
            yield* Effect.logWarning(
              `[UserAuthCache] Ignoring stale timestamp ${timestamp} (current: ${currentTimestamp}) for user ${userId}`,
            );
            return currentTimestamp;
          }

          // Update cache with new timestamp
          yield* cache.set(userId, timestamp);

          yield* Effect.logInfo(`[UserAuthCache] ✅ Password changed timestamp set successfully for user ${userId}`);

          return timestamp;
        }),

      /**
       * Validate a token by checking if it was issued after the last password change
       * Returns true if the token is valid, false if it should be rejected
       *
       * Validation logic:
       * - If passwordChangedAt is null (never changed) → token is valid
       * - Otherwise: token is valid if tokenIssuedAt >= passwordChangedAt
       */
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

/**
 * UserAuthCache Live Layer
 * Provides UserAuthCache with UserRepository dependency
 */
export const UserAuthCacheLive = UserAuthCache.Default.pipe(Layer.provide(UserRepository.Default));
