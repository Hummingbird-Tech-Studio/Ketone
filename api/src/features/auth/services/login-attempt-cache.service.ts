import { Effect } from 'effect';
import {
  type AttemptStatus,
  type FailedAttemptResult,
  ENABLE_IP_RATE_LIMITING,
  DEFAULT_RECORD,
  LOGIN_CONFIG,
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
          const emailStatus = checkRecord(emailRecord, LOGIN_CONFIG);

          if (!ENABLE_IP_RATE_LIMITING) {
            yield* Effect.logInfo(
              `Check attempt for email (IP rate limiting disabled): allowed=${emailStatus.allowed}, remaining=${emailStatus.remainingAttempts}`,
            );
            return emailStatus;
          }

          const ipRecord = yield* ipCache.get(ip);
          const ipStatus = checkRecord(ipRecord, LOGIN_CONFIG);
          const status = getMostRestrictiveStatus(emailStatus, ipStatus);

          yield* Effect.logInfo(
            `Check attempt for email ip=${ip}: allowed=${status.allowed}, remaining=${status.remainingAttempts}`,
          );

          return status;
        }).pipe(Effect.annotateLogs({ service: SERVICE_NAME })),

      recordFailedAttempt: (email: string, ip: string): Effect.Effect<FailedAttemptResult> =>
        Effect.gen(function* () {
          const normalizedEmail = email.toLowerCase().trim();
          const { newAttempts: newEmailAttempts } = yield* recordFailedAttemptForKey(
            emailCache,
            normalizedEmail,
            LOGIN_CONFIG,
          );

          if (!ENABLE_IP_RATE_LIMITING) {
            const remainingAttempts = Math.max(0, LOGIN_CONFIG.maxAttempts - newEmailAttempts);
            const delay = getDelay(newEmailAttempts, LOGIN_CONFIG);

            yield* Effect.logInfo(
              `Recorded failed attempt for email (IP rate limiting disabled): attempts=${newEmailAttempts}, remaining=${remainingAttempts}`,
            );

            return { remainingAttempts, delay };
          }

          const { newAttempts: newIpAttempts } = yield* recordFailedAttemptForKey(ipCache, ip, LOGIN_CONFIG);

          const maxAttempts = Math.max(newEmailAttempts, newIpAttempts);
          const remainingAttempts = Math.max(0, LOGIN_CONFIG.maxAttempts - maxAttempts);
          const delay = getDelay(maxAttempts, LOGIN_CONFIG);

          yield* Effect.logInfo(
            `Recorded failed attempt for email ip=${ip}: attempts=${maxAttempts}, remaining=${remainingAttempts}`,
          );

          return { remainingAttempts, delay };
        }).pipe(Effect.annotateLogs({ service: SERVICE_NAME })),

      resetAttempts: (email: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const normalizedEmail = email.toLowerCase().trim();
          yield* emailCache.set(normalizedEmail, DEFAULT_RECORD);
          yield* Effect.logInfo('Reset attempts for email');
        }).pipe(Effect.annotateLogs({ service: SERVICE_NAME })),

      applyDelay: (delay: Parameters<typeof applyDelay>[0]): Effect.Effect<void> => applyDelay(delay, SERVICE_NAME),
    };
  }),
  accessors: true,
}) {}
