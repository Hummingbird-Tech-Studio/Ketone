/**
 * Shared utilities for attempt-based rate limiting
 * Used by LoginAttemptCache and PasswordAttemptCache
 */

import {
  getAttemptDelaySeconds,
  getLoginAttemptDelaySeconds,
  LOCKOUT_DURATION_SECONDS,
  MAX_PASSWORD_ATTEMPTS,
  MAX_LOGIN_ATTEMPTS,
} from '@ketone/shared';
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

export interface AttemptConfig {
  maxAttempts: number;
  getDelaySeconds: (attempts: number) => number;
}

// ============================================================================
// Configurations
// ============================================================================

/** Config for login attempts (more permissive) */
export const LOGIN_CONFIG: AttemptConfig = {
  maxAttempts: MAX_LOGIN_ATTEMPTS,
  getDelaySeconds: getLoginAttemptDelaySeconds,
};

/** Config for password change attempts (stricter) */
export const PASSWORD_CONFIG: AttemptConfig = {
  maxAttempts: MAX_PASSWORD_ATTEMPTS,
  getDelaySeconds: getAttemptDelaySeconds,
};

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

export const getDelay = (attempts: number, config: AttemptConfig): Duration.DurationInput =>
  Duration.seconds(config.getDelaySeconds(attempts));

export const getNowSeconds = (): number => Math.floor(Date.now() / 1000);

export const checkRecord = (record: AttemptRecord, config: AttemptConfig): AttemptStatus => {
  const now = getNowSeconds();

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfter: record.lockedUntil - now,
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    return { allowed: true, remainingAttempts: config.maxAttempts, retryAfter: null };
  }

  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - record.failedAttempts,
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
  config: AttemptConfig,
) =>
  Effect.gen(function* () {
    const record = yield* cache.get(key);
    const now = getNowSeconds();

    const lockExpired = record.lockedUntil && record.lockedUntil <= now;
    const newAttempts = lockExpired ? 1 : record.failedAttempts + 1;
    const locked = newAttempts >= config.maxAttempts;

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
