import { MAX_PASSWORD_ATTEMPTS } from '@ketone/shared';
import { Effect } from 'effect';
import {
  type AttemptStatus,
  type FailedAttemptResult,
  ENABLE_IP_RATE_LIMITING,
  DEFAULT_RECORD,
  getDelay,
  checkRecord,
  getMostRestrictiveStatus,
  createAttemptCache,
  recordFailedAttemptForKey,
  applyDelay,
} from '../../../lib/attempt-rate-limit';

const SERVICE_NAME = 'PasswordAttemptCache';

export class PasswordAttemptCache extends Effect.Service<PasswordAttemptCache>()('PasswordAttemptCache', {
  effect: Effect.gen(function* () {
    const userCache = yield* createAttemptCache();
    const ipCache = yield* createAttemptCache();

    return {
      checkAttempt: (userId: string, ip: string): Effect.Effect<AttemptStatus> =>
        Effect.gen(function* () {
          const userRecord = yield* userCache.get(userId);
          const userStatus = checkRecord(userRecord);

          if (!ENABLE_IP_RATE_LIMITING) {
            yield* Effect.logInfo(
              `[${SERVICE_NAME}] Check attempt for user=${userId} (IP rate limiting disabled): allowed=${userStatus.allowed}, remaining=${userStatus.remainingAttempts}`,
            );
            return userStatus;
          }

          const ipRecord = yield* ipCache.get(ip);
          const ipStatus = checkRecord(ipRecord);
          const status = getMostRestrictiveStatus(userStatus, ipStatus);

          yield* Effect.logInfo(
            `[${SERVICE_NAME}] Check attempt for user=${userId} ip=${ip}: allowed=${status.allowed}, remaining=${status.remainingAttempts}`,
          );

          return status;
        }),

      recordFailedAttempt: (userId: string, ip: string): Effect.Effect<FailedAttemptResult> =>
        Effect.gen(function* () {
          const { newAttempts: newUserAttempts } = yield* recordFailedAttemptForKey(userCache, userId);

          if (!ENABLE_IP_RATE_LIMITING) {
            const remainingAttempts = Math.max(0, MAX_PASSWORD_ATTEMPTS - newUserAttempts);
            const delay = getDelay(newUserAttempts);

            yield* Effect.logInfo(
              `[${SERVICE_NAME}] Recorded failed attempt for user=${userId} (IP rate limiting disabled): attempts=${newUserAttempts}, remaining=${remainingAttempts}`,
            );

            return { remainingAttempts, delay };
          }

          const { newAttempts: newIpAttempts } = yield* recordFailedAttemptForKey(ipCache, ip);

          const maxAttempts = Math.max(newUserAttempts, newIpAttempts);
          const remainingAttempts = Math.max(0, MAX_PASSWORD_ATTEMPTS - maxAttempts);
          const delay = getDelay(maxAttempts);

          yield* Effect.logInfo(
            `[${SERVICE_NAME}] Recorded failed attempt for user=${userId} ip=${ip}: attempts=${maxAttempts}, remaining=${remainingAttempts}`,
          );

          return { remainingAttempts, delay };
        }),

      resetAttempts: (userId: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* userCache.set(userId, DEFAULT_RECORD);
          yield* Effect.logInfo(`[${SERVICE_NAME}] Reset attempts for user=${userId}`);
        }),

      applyDelay: (delay: Parameters<typeof applyDelay>[0]): Effect.Effect<void> => applyDelay(delay, SERVICE_NAME),
    };
  }),
  accessors: true,
}) {}
