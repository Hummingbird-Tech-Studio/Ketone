import { PASSWORD_RESET_IP_LIMIT, PASSWORD_RESET_IP_WINDOW_SECONDS } from '@ketone/shared';
import { Cache, Duration, Effect } from 'effect';

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
}

const CACHE_CAPACITY = 10_000;
const DEFAULT_RECORD: RateLimitRecord = { count: 0, windowStart: 0 };

const getNowSeconds = (): number => Math.floor(Date.now() / 1000);

export class PasswordResetIpRateLimitService extends Effect.Service<PasswordResetIpRateLimitService>()(
  'PasswordResetIpRateLimitService',
  {
    effect: Effect.gen(function* () {
      const ipCache = yield* Cache.make<string, RateLimitRecord, never>({
        capacity: CACHE_CAPACITY,
        timeToLive: Duration.seconds(PASSWORD_RESET_IP_WINDOW_SECONDS),
        lookup: () => Effect.succeed(DEFAULT_RECORD),
      });

      return {
        /**
         * Check if IP is allowed to make a password reset request and increment counter.
         * Returns status with allowed flag and remaining requests.
         */
        checkAndIncrement: (ip: string): Effect.Effect<RateLimitStatus> =>
          Effect.gen(function* () {
            const now = getNowSeconds();
            const record = yield* ipCache.get(ip);

            // Check if window has expired
            const windowExpired = now - record.windowStart >= PASSWORD_RESET_IP_WINDOW_SECONDS;
            const currentCount = windowExpired ? 0 : record.count;

            // Check if allowed
            if (currentCount >= PASSWORD_RESET_IP_LIMIT) {
              yield* Effect.logWarning(
                `[PasswordResetIpRateLimitService] Rate limit exceeded for IP: requests=${currentCount}`,
              );
              return {
                allowed: false,
                remaining: 0,
              };
            }

            // Increment counter
            const newRecord: RateLimitRecord = {
              count: currentCount + 1,
              windowStart: windowExpired ? now : record.windowStart,
            };

            yield* ipCache.set(ip, newRecord);

            const remaining = PASSWORD_RESET_IP_LIMIT - newRecord.count;

            yield* Effect.logInfo(
              `[PasswordResetIpRateLimitService] Request allowed for IP: count=${newRecord.count}, remaining=${remaining}`,
            );

            return {
              allowed: true,
              remaining,
            };
          }),

        /**
         * Reset rate limit for an IP (useful for testing)
         */
        reset: (ip: string): Effect.Effect<void> =>
          Effect.gen(function* () {
            yield* ipCache.set(ip, DEFAULT_RECORD);
            yield* Effect.logInfo(`[PasswordResetIpRateLimitService] Reset rate limit for IP`);
          }),
      };
    }),
    accessors: true,
  },
) {}
