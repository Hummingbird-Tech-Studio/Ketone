import { Effect } from 'effect';
import { UserRepository } from '../../auth/repositories';
import { PasswordService } from '../../auth/services';
import { EmailAlreadyInUseError, InvalidPasswordError, SameEmailError, UserAccountServiceError } from '../domain';

export class UserAccountService extends Effect.Service<UserAccountService>()('UserAccountService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;

    return {
      updateEmail: (userId: string, newEmail: string, password: string) =>
        Effect.gen(function* () {
          const normalizedNewEmail = newEmail.trim().toLowerCase();

          yield* Effect.logInfo(`[UserAccountService] Updating email for user ${userId}`);

          // 1. Get user with password hash
          const user = yield* userRepository.findUserByIdWithPassword(userId);
          if (!user) {
            return yield* Effect.fail(
              new UserAccountServiceError({
                message: 'User not found',
              }),
            );
          }

          // 2. Verify new email is different from current
          if (user.email === normalizedNewEmail) {
            yield* Effect.logInfo(`[UserAccountService] New email is same as current email`);
            return yield* Effect.fail(
              new SameEmailError({
                message: 'New email must be different from current email',
              }),
            );
          }

          // 3. Verify password
          const isPasswordValid = yield* passwordService.verifyPassword(password, user.passwordHash);
          if (!isPasswordValid) {
            yield* Effect.logInfo(`[UserAccountService] Invalid password provided`);
            return yield* Effect.fail(
              new InvalidPasswordError({
                message: 'Invalid password',
              }),
            );
          }

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

          yield* Effect.logInfo(`[UserAccountService] Email updated successfully for user ${userId}`);

          return { id: updatedUser.id, email: updatedUser.email };
        }),
    };
  }),
  dependencies: [UserRepository.Default, PasswordService.Default],
  accessors: true,
}) {}
