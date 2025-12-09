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

const SERVICE_NAME = 'LoginAttemptCache';

export class LoginAttemptCache extends Effect.Service<LoginAttemptCache>()('LoginAttemptCache', {
  effect: Effect.gen(function* () {
    const emailCache = yield* createAttemptCache();
    const ipCache = yield* createAttemptCache();

    return {
      checkAttempt: (email: string, ip: string): Effect.Effect<AttemptStatus> =>
        Effect.gen(function* () {
          const normalizedEmail = email.toLowerCase().trim();
          const emailRecord = yield* emailCache.get(normalizedEmail);
          const emailStatus = checkRecord(emailRecord);

          if (!ENABLE_IP_RATE_LIMITING) {
            yield* Effect.logInfo(
              `[${SERVICE_NAME}] Check attempt for email (IP rate limiting disabled): allowed=${emailStatus.allowed}, remaining=${emailStatus.remainingAttempts}`,
            );
            return emailStatus;
          }

          const ipRecord = yield* ipCache.get(ip);
          const ipStatus = checkRecord(ipRecord);
          const status = getMostRestrictiveStatus(emailStatus, ipStatus);

          yield* Effect.logInfo(
            `[${SERVICE_NAME}] Check attempt for email ip=${ip}: allowed=${status.allowed}, remaining=${status.remainingAttempts}`,
          );

          return status;
        }),

      recordFailedAttempt: (email: string, ip: string): Effect.Effect<FailedAttemptResult> =>
        Effect.gen(function* () {
          const normalizedEmail = email.toLowerCase().trim();
          const { newAttempts: newEmailAttempts } = yield* recordFailedAttemptForKey(emailCache, normalizedEmail);

          if (!ENABLE_IP_RATE_LIMITING) {
            const remainingAttempts = Math.max(0, MAX_PASSWORD_ATTEMPTS - newEmailAttempts);
            const delay = getDelay(newEmailAttempts);

            yield* Effect.logInfo(
              `[${SERVICE_NAME}] Recorded failed attempt for email (IP rate limiting disabled): attempts=${newEmailAttempts}, remaining=${remainingAttempts}`,
            );

            return { remainingAttempts, delay };
          }

          const { newAttempts: newIpAttempts } = yield* recordFailedAttemptForKey(ipCache, ip);

          const maxAttempts = Math.max(newEmailAttempts, newIpAttempts);
          const remainingAttempts = Math.max(0, MAX_PASSWORD_ATTEMPTS - maxAttempts);
          const delay = getDelay(maxAttempts);

          yield* Effect.logInfo(
            `[${SERVICE_NAME}] Recorded failed attempt for email ip=${ip}: attempts=${maxAttempts}, remaining=${remainingAttempts}`,
          );

          return { remainingAttempts, delay };
        }),

      resetAttempts: (email: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const normalizedEmail = email.toLowerCase().trim();
          yield* emailCache.set(normalizedEmail, DEFAULT_RECORD);
          yield* Effect.logInfo(`[${SERVICE_NAME}] Reset attempts for email`);
        }),

      applyDelay: (delay: Parameters<typeof applyDelay>[0]): Effect.Effect<void> => applyDelay(delay, SERVICE_NAME),
    };
  }),
  accessors: true,
}) {}
