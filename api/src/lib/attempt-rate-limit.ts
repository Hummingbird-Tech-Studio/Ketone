/**
 * Shared utilities for attempt-based rate limiting
 * Used by LoginAttemptCache and PasswordAttemptCache
 */

import { getAttemptDelaySeconds, LOCKOUT_DURATION_SECONDS, MAX_PASSWORD_ATTEMPTS } from '@ketone/shared';
import { Cache, Duration, Effect } from 'effect';

// ============================================================================
// Types
// ============================================================================

export interface AttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

export interface AttemptStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfter: number | null;
}

export interface FailedAttemptResult {
  remainingAttempts: number;
  delay: Duration.DurationInput;
}

// ============================================================================
// Constants
// ============================================================================

export const CACHE_CAPACITY = 10_000;
export const CACHE_TTL_HOURS = 1;

/** IP rate limiting is only enabled in production for security */
export const ENABLE_IP_RATE_LIMITING = Bun.env.NODE_ENV === 'production';

export const DEFAULT_RECORD: AttemptRecord = { failedAttempts: 0, lockedUntil: null };

// ============================================================================
// Utility Functions
// ============================================================================

export const getDelay = (attempts: number): Duration.DurationInput =>
  Duration.seconds(getAttemptDelaySeconds(attempts));

export const getNowSeconds = (): number => Math.floor(Date.now() / 1000);

export const checkRecord = (record: AttemptRecord): AttemptStatus => {
  const now = getNowSeconds();

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter: record.lockedUntil - now,
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    return { allowed: true, remainingAttempts: MAX_PASSWORD_ATTEMPTS, retryAfter: null };
  }

  return {
    allowed: true,
    remainingAttempts: MAX_PASSWORD_ATTEMPTS - record.failedAttempts,
    retryAfter: null,
  };
};

export const getMostRestrictiveStatus = (primaryStatus: AttemptStatus, ipStatus: AttemptStatus): AttemptStatus => {
  if (!primaryStatus.allowed) return primaryStatus;
  if (!ipStatus.allowed) return ipStatus;

  return primaryStatus.remainingAttempts <= ipStatus.remainingAttempts ? primaryStatus : ipStatus;
};

// ============================================================================
// Cache Factory
// ============================================================================

export const createAttemptCache = () =>
  Cache.make<string, AttemptRecord, never>({
    capacity: CACHE_CAPACITY,
    timeToLive: Duration.hours(CACHE_TTL_HOURS),
    lookup: () => Effect.succeed(DEFAULT_RECORD),
  });

// ============================================================================
// Shared Logic
// ============================================================================

export const recordFailedAttemptForKey = (
  cache: Effect.Effect.Success<ReturnType<typeof createAttemptCache>>,
  key: string,
) =>
  Effect.gen(function* () {
    const record = yield* cache.get(key);
    const now = getNowSeconds();

    const lockExpired = record.lockedUntil && record.lockedUntil <= now;
    const newAttempts = lockExpired ? 1 : record.failedAttempts + 1;
    const locked = newAttempts >= MAX_PASSWORD_ATTEMPTS;

    const newRecord: AttemptRecord = {
      failedAttempts: newAttempts,
      lockedUntil: locked ? now + LOCKOUT_DURATION_SECONDS : null,
    };

    yield* cache.set(key, newRecord);

    return { newAttempts, locked };
  });

export const applyDelay = (delay: Duration.DurationInput, serviceName: string) =>
  Effect.gen(function* () {
    const millis = Duration.toMillis(Duration.decode(delay));
    if (millis > 0) {
      yield* Effect.logInfo(`[${serviceName}] Applying delay of ${millis}ms`);
      yield* Effect.sleep(delay);
    }
  });
