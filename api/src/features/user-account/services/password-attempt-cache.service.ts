import {
  getAttemptDelaySeconds,
  LOCKOUT_DURATION_SECONDS,
  MAX_PASSWORD_ATTEMPTS,
} from '@ketone/shared';
import { Cache, Data, Duration, Effect } from 'effect';

export class PasswordAttemptCacheError extends Data.TaggedError('PasswordAttemptCacheError')<{
  message: string;
  cause?: unknown;
}> {}

interface AttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

interface AttemptStatus {
  allowed: boolean;
  remainingAttempts: number;
  retryAfter: number | null;
}

interface FailedAttemptResult {
  remainingAttempts: number;
  delay: Duration.DurationInput;
}

const CACHE_CAPACITY = 10_000;
const CACHE_TTL_HOURS = 1;

const DEFAULT_RECORD: AttemptRecord = { failedAttempts: 0, lockedUntil: null };

const getDelay = (attempts: number): Duration.DurationInput =>
  Duration.seconds(getAttemptDelaySeconds(attempts));

const getNowSeconds = (): number => Math.floor(Date.now() / 1000);

const checkRecord = (record: AttemptRecord): AttemptStatus => {
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

const getMostRestrictiveStatus = (userStatus: AttemptStatus, ipStatus: AttemptStatus): AttemptStatus => {
  if (!userStatus.allowed) return userStatus;
  if (!ipStatus.allowed) return ipStatus;

  return userStatus.remainingAttempts <= ipStatus.remainingAttempts ? userStatus : ipStatus;
};

export class PasswordAttemptCache extends Effect.Service<PasswordAttemptCache>()('PasswordAttemptCache', {
  effect: Effect.gen(function* () {
    const userCache = yield* Cache.make<string, AttemptRecord, never>({
      capacity: CACHE_CAPACITY,
      timeToLive: Duration.hours(CACHE_TTL_HOURS),
      lookup: () => Effect.succeed(DEFAULT_RECORD),
    });

    const ipCache = yield* Cache.make<string, AttemptRecord, never>({
      capacity: CACHE_CAPACITY,
      timeToLive: Duration.hours(CACHE_TTL_HOURS),
      lookup: () => Effect.succeed(DEFAULT_RECORD),
    });

    return {
      checkAttempt: (userId: string, ip: string) =>
        Effect.gen(function* () {
          const userRecord = yield* userCache.get(userId);
          const ipRecord = yield* ipCache.get(ip);

          const userStatus = checkRecord(userRecord);
          const ipStatus = checkRecord(ipRecord);

          const status = getMostRestrictiveStatus(userStatus, ipStatus);

          yield* Effect.logInfo(
            `[PasswordAttemptCache] Check attempt for user=${userId} ip=${ip}: allowed=${status.allowed}, remaining=${status.remainingAttempts}`,
          );

          return status;
        }),

      recordFailedAttempt: (userId: string, ip: string) =>
        Effect.gen(function* () {
          const userRecord = yield* userCache.get(userId);
          const ipRecord = yield* ipCache.get(ip);

          const now = getNowSeconds();

          const userLockExpired = userRecord.lockedUntil && userRecord.lockedUntil <= now;
          const ipLockExpired = ipRecord.lockedUntil && ipRecord.lockedUntil <= now;

          const newUserAttempts = userLockExpired ? 1 : userRecord.failedAttempts + 1;
          const newIpAttempts = ipLockExpired ? 1 : ipRecord.failedAttempts + 1;

          const userLocked = newUserAttempts >= MAX_PASSWORD_ATTEMPTS;
          const ipLocked = newIpAttempts >= MAX_PASSWORD_ATTEMPTS;

          const newUserRecord: AttemptRecord = {
            failedAttempts: newUserAttempts,
            lockedUntil: userLocked ? now + LOCKOUT_DURATION_SECONDS : null,
          };

          const newIpRecord: AttemptRecord = {
            failedAttempts: newIpAttempts,
            lockedUntil: ipLocked ? now + LOCKOUT_DURATION_SECONDS : null,
          };

          yield* userCache.set(userId, newUserRecord);
          yield* ipCache.set(ip, newIpRecord);

          const maxAttempts = Math.max(newUserAttempts, newIpAttempts);
          const remainingAttempts = Math.max(0, MAX_PASSWORD_ATTEMPTS - maxAttempts);
          const delay = getDelay(maxAttempts);

          yield* Effect.logInfo(
            `[PasswordAttemptCache] Recorded failed attempt for user=${userId} ip=${ip}: attempts=${maxAttempts}, remaining=${remainingAttempts}`,
          );

          return { remainingAttempts, delay } as FailedAttemptResult;
        }),

      resetAttempts: (userId: string) =>
        Effect.gen(function* () {
          yield* userCache.set(userId, DEFAULT_RECORD);
          yield* Effect.logInfo(`[PasswordAttemptCache] Reset attempts for user=${userId}`);
        }),

      applyDelay: (delay: Duration.DurationInput) =>
        Effect.gen(function* () {
          const millis = Duration.toMillis(Duration.decode(delay));
          if (millis > 0) {
            yield* Effect.logInfo(`[PasswordAttemptCache] Applying delay of ${millis}ms`);
            yield* Effect.sleep(delay);
          }
        }),
    };
  }),
  accessors: true,
}) {}
