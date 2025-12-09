import { SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_SECONDS } from '@ketone/shared';
import { Cache, Duration, Effect } from 'effect';
import { CACHE_CAPACITY, ENABLE_IP_RATE_LIMITING, getNowSeconds } from '../../../lib/attempt-rate-limit';

interface RateLimitRecord {
  count: number;
  windowStart: number;
}

interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
}

const DEFAULT_RECORD: RateLimitRecord = { count: 0, windowStart: 0 };

export class SignupIpRateLimitService extends Effect.Service<SignupIpRateLimitService>()(
  'SignupIpRateLimitService',
  {
    effect: Effect.gen(function* () {
      const ipCache = yield* Cache.make<string, RateLimitRecord, never>({
        capacity: CACHE_CAPACITY,
        timeToLive: Duration.seconds(SIGNUP_IP_WINDOW_SECONDS),
        lookup: () => Effect.succeed(DEFAULT_RECORD),
      });

      return {
        /**
         * Check if IP is allowed to make a signup request and increment counter.
         * Returns status with allowed flag and remaining requests.
         * Rate limiting is only enforced in production.
         */
        checkAndIncrement: (ip: string): Effect.Effect<RateLimitStatus> =>
          Effect.gen(function* () {
            if (!ENABLE_IP_RATE_LIMITING) {
              yield* Effect.logInfo(
                `[SignupIpRateLimitService] IP rate limiting disabled (non-production)`,
              );
              return {
                allowed: true,
                remaining: SIGNUP_IP_LIMIT,
              };
            }

            const now = getNowSeconds();
            const record = yield* ipCache.get(ip);

            // Check if window has expired
            const windowExpired = now - record.windowStart >= SIGNUP_IP_WINDOW_SECONDS;
            const currentCount = windowExpired ? 0 : record.count;

            // Check if allowed
            if (currentCount >= SIGNUP_IP_LIMIT) {
              yield* Effect.logWarning(
                `[SignupIpRateLimitService] Rate limit exceeded for IP: requests=${currentCount}`,
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

            const remaining = SIGNUP_IP_LIMIT - newRecord.count;

            yield* Effect.logInfo(
              `[SignupIpRateLimitService] Request allowed for IP: count=${newRecord.count}, remaining=${remaining}`,
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
            yield* Effect.logInfo(`[SignupIpRateLimitService] Reset rate limit for IP`);
          }),
      };
    }),
    accessors: true,
  },
) {}
