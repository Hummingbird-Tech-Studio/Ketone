import { Effect } from 'effect';
import { getUnixTime } from 'date-fns';
import { UserRepository } from '../../auth/repositories';
import { PasswordService, UserAuthCache } from '../../auth/services';
import { CycleRepository, CycleCompletionCache, CycleRefCache } from '../../cycle';
import { ProfileRepository } from '../../profile/repositories';
import {
  EmailAlreadyInUseError,
  InvalidPasswordError,
  SameEmailError,
  TooManyRequestsError,
  UserAccountServiceError,
} from '../domain';
import { PasswordAttemptCache } from './password-attempt-cache.service';

export class UserAccountService extends Effect.Service<UserAccountService>()('UserAccountService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;
    const attemptCache = yield* PasswordAttemptCache;
    const userAuthCache = yield* UserAuthCache;
    const cycleRepository = yield* CycleRepository;
    const profileRepository = yield* ProfileRepository;
    const cycleRefCache = yield* CycleRefCache;
    const cycleCompletionCache = yield* CycleCompletionCache;

    /**
     * Check rate limit and fetch user with password hash.
     * Fails with TooManyRequestsError if rate limited, or UserAccountServiceError if user not found.
     */
    const checkRateLimitAndFetchUser = (userId: string, ip: string) =>
      Effect.gen(function* () {
        const attemptStatus = yield* attemptCache.checkAttempt(userId, ip);
        if (!attemptStatus.allowed) {
          yield* Effect.logInfo(`[UserAccountService] Rate limited for user ${userId}`);
          return yield* Effect.fail(
            new TooManyRequestsError({
              message: 'Too many failed password attempts. Please try again later.',
              remainingAttempts: 0,
              retryAfter: attemptStatus.retryAfter!,
            }),
          );
        }

        const user = yield* userRepository.findUserByIdWithPassword(userId);
        if (!user) {
          return yield* Effect.fail(
            new UserAccountServiceError({
              message: 'User not found',
            }),
          );
        }

        return user;
      });

    /**
     * Verify password with rate limiting.
     * Records failed attempts and applies delay. Fails with InvalidPasswordError or TooManyRequestsError.
     */
    const verifyPasswordWithRateLimit = (userId: string, ip: string, password: string, passwordHash: string) =>
      Effect.gen(function* () {
        const isPasswordValid = yield* passwordService.verifyPassword(password, passwordHash);
        if (!isPasswordValid) {
          yield* Effect.logInfo(`[UserAccountService] Invalid password provided for user ${userId}`);
          const result = yield* attemptCache.recordFailedAttempt(userId, ip);
          yield* attemptCache.applyDelay(result.delay);

          if (result.remainingAttempts === 0) {
            const status = yield* attemptCache.checkAttempt(userId, ip);
            return yield* Effect.fail(
              new TooManyRequestsError({
                message: 'Too many failed password attempts. Please try again later.',
                remainingAttempts: 0,
                retryAfter: status.retryAfter!,
              }),
            );
          }

          return yield* Effect.fail(
            new InvalidPasswordError({
              message: 'Invalid password',
              remainingAttempts: result.remainingAttempts,
            }),
          );
        }
      });

    return {
      updateEmail: (userId: string, newEmail: string, password: string, ip: string) =>
        Effect.gen(function* () {
          const normalizedNewEmail = newEmail.trim().toLowerCase();

          yield* Effect.logInfo(`[UserAccountService] Updating email for user ${userId}`);

          // 1. Check rate limit and get user
          const user = yield* checkRateLimitAndFetchUser(userId, ip);

          // 2. Verify new email is different from current
          if (user.email === normalizedNewEmail) {
            yield* Effect.logInfo(`[UserAccountService] New email is same as current email`);
            return yield* Effect.fail(
              new SameEmailError({
                message: 'New email must be different from current email',
              }),
            );
          }

          // 3. Verify password (with rate limiting)
          yield* verifyPasswordWithRateLimit(userId, ip, password, user.passwordHash);

          // 4. Verify email is not in use by another user
          const existingUser = yield* userRepository.findUserByEmail(normalizedNewEmail);
          if (existingUser) {
            yield* Effect.logInfo(`[UserAccountService] Email already in use`);
            return yield* Effect.fail(
              new EmailAlreadyInUseError({
                message: 'Email is already in use',
                email: normalizedNewEmail,
              }),
            );
          }

          // 5. Update email
          const updatedUser = yield* userRepository.updateUserEmail(userId, normalizedNewEmail);

          // 6. Reset rate limit attempts on success
          yield* attemptCache.resetAttempts(userId);

          yield* Effect.logInfo(`[UserAccountService] Email updated successfully for user ${userId}`);

          return { id: updatedUser.id, email: updatedUser.email };
        }),

      updatePassword: (userId: string, currentPassword: string, newPassword: string, ip: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAccountService] Updating password for user ${userId}`);

          // 1. Check rate limit and get user
          const user = yield* checkRateLimitAndFetchUser(userId, ip);

          // 2. Verify current password (with rate limiting)
          yield* verifyPasswordWithRateLimit(userId, ip, currentPassword, user.passwordHash);

          // 3. Hash new password
          yield* Effect.logInfo(`[UserAccountService] Hashing new password`);
          const newPasswordHash = yield* passwordService.hashPassword(newPassword);

          // 4. Update password in database
          yield* Effect.logInfo(`[UserAccountService] Updating password in database`);
          const updatedUser = yield* userRepository.updateUserPassword(userId, newPasswordHash);

          // 5. Reset rate limit attempts on success
          yield* attemptCache.resetAttempts(userId);

          // 6. Invalidate existing JWT tokens by updating passwordChangedAt
          const passwordChangedAt = updatedUser.passwordChangedAt ?? updatedUser.updatedAt;
          const passwordChangedAtTimestamp = getUnixTime(passwordChangedAt);
          yield* Effect.logInfo(
            `[UserAccountService] Invalidating tokens (passwordChangedAt: ${passwordChangedAtTimestamp})`,
          );
          yield* userAuthCache.setPasswordChangedAt(userId, passwordChangedAtTimestamp);

          yield* Effect.logInfo(`[UserAccountService] Password updated successfully for user ${userId}`);

          return { message: 'Password updated successfully' };
        }),

      deleteAccount: (userId: string, password: string, ip: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAccountService] Deleting account for user ${userId}`);

          // 1. Check rate limit and get user
          const user = yield* checkRateLimitAndFetchUser(userId, ip);

          // 2. Verify password (with rate limiting)
          yield* verifyPasswordWithRateLimit(userId, ip, password, user.passwordHash);

          // 3. Delete all cycles for user (must be before user deletion due to FK)
          yield* Effect.logInfo(`[UserAccountService] Deleting all cycles for user ${userId}`);
          yield* cycleRepository.deleteAllByUserId(userId);

          // 4. Delete profile for user (must be before user deletion due to FK)
          yield* Effect.logInfo(`[UserAccountService] Deleting profile for user ${userId}`);
          yield* profileRepository.deleteByUserId(userId);

          // 5. Delete user
          yield* Effect.logInfo(`[UserAccountService] Deleting user ${userId}`);
          yield* userRepository.deleteUserById(userId);

          // 6. Clear all caches (best-effort, ignore errors)
          yield* Effect.logInfo(`[UserAccountService] Clearing caches for user ${userId}`);
          yield* attemptCache.resetAttempts(userId).pipe(Effect.ignore);
          yield* cycleRefCache.invalidate(userId).pipe(Effect.ignore);
          yield* cycleCompletionCache.invalidate(userId).pipe(Effect.ignore);
          yield* userAuthCache.invalidate(userId).pipe(Effect.ignore);

          yield* Effect.logInfo(`[UserAccountService] Account deleted successfully for user ${userId}`);
        }),
    };
  }),
  dependencies: [
    UserRepository.Default,
    PasswordService.Default,
    PasswordAttemptCache.Default,
    UserAuthCache.Default,
    CycleRepository.Default,
    ProfileRepository.Default,
    CycleRefCache.Default,
    CycleCompletionCache.Default,
  ],
  accessors: true,
}) {}
