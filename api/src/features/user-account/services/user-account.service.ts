import { Effect } from 'effect';
import { UserRepository } from '../../auth/repositories';
import { PasswordService } from '../../auth/services';
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

    return {
      updateEmail: (userId: string, newEmail: string, password: string, ip: string) =>
        Effect.gen(function* () {
          const normalizedNewEmail = newEmail.trim().toLowerCase();

          yield* Effect.logInfo(`[UserAccountService] Updating email for user ${userId}`);

          // 1. Check rate limit
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

          // 2. Get user with password hash
          const user = yield* userRepository.findUserByIdWithPassword(userId);
          if (!user) {
            return yield* Effect.fail(
              new UserAccountServiceError({
                message: 'User not found',
              }),
            );
          }

          // 3. Verify new email is different from current
          if (user.email === normalizedNewEmail) {
            yield* Effect.logInfo(`[UserAccountService] New email is same as current email`);
            return yield* Effect.fail(
              new SameEmailError({
                message: 'New email must be different from current email',
              }),
            );
          }

          // 4. Verify password (with rate limiting)
          const isPasswordValid = yield* passwordService.verifyPassword(password, user.passwordHash);
          if (!isPasswordValid) {
            yield* Effect.logInfo(`[UserAccountService] Invalid password provided`);
            const result = yield* attemptCache.recordFailedAttempt(userId, ip);
            yield* attemptCache.applyDelay(result.delay);

            // If no remaining attempts, user is now locked out
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

          // 5. Verify email is not in use by another user
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

          // 6. Update email
          const updatedUser = yield* userRepository.updateUserEmail(userId, normalizedNewEmail);

          // 7. Reset rate limit attempts on success
          yield* attemptCache.resetAttempts(userId);

          yield* Effect.logInfo(`[UserAccountService] Email updated successfully for user ${userId}`);

          return { id: updatedUser.id, email: updatedUser.email };
        }),
    };
  }),
  dependencies: [UserRepository.Default, PasswordService.Default, PasswordAttemptCache.Default],
  accessors: true,
}) {}
