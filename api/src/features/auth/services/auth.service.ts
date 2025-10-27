import { Effect, Layer } from 'effect';
import { InvalidCredentialsError, UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

/**
 * Auth Service
 */

export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;
    const jwtService = yield* JwtService;

    return {
      signup: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting signup process`);

          // Check if user already exists (performance optimization to avoid unnecessary hashing)
          // Note: Database unique constraint is the authoritative check for race conditions
          const existingUser = yield* userRepository.findUserByEmail(email);

          if (existingUser) {
            yield* Effect.logWarning(`[AuthService] User already exists`);
            return yield* Effect.fail(
              new UserAlreadyExistsError({
                message: 'User with this email already exists',
                email,
              }),
            );
          }

          // Hash password
          yield* Effect.logInfo(`[AuthService] Hashing password`);
          const passwordHash = yield* passwordService.hashPassword(password);

          // Create user (repository maps unique constraint violations to UserAlreadyExistsError)
          yield* Effect.logInfo(`[AuthService] Creating user in database`);
          const user = yield* userRepository.createUser(email, passwordHash);

          yield* Effect.logInfo(`[AuthService] User created successfully with id: ${user.id}`);

          return {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          };
        }),
      login: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting login process`);

          const user = yield* userRepository.findUserByEmailWithPassword(email);

          if (!user) {
            yield* Effect.logWarning(`[AuthService] User not found`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid email or password',
              }),
            );
          }

          // Verify password
          yield* Effect.logInfo(`[AuthService] Verifying password`);
          const isPasswordValid = yield* passwordService.verifyPassword(password, user.passwordHash);

          if (!isPasswordValid) {
            yield* Effect.logWarning(`[AuthService] Invalid password`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid email or password',
              }),
            );
          }

          // Generate JWT token
          yield* Effect.logInfo(`[AuthService] Generating JWT token`);
          const token = yield* jwtService.generateToken(user.id, user.email);

          yield* Effect.logInfo(`[AuthService] User logged in successfully with id: ${user.id}`);

          return {
            token,
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
          };
        }),
      updatePassword: (userId: string, currentPassword: string, newPassword: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting password update process`);

          // Find user by authenticated userId (from JWT token)
          const user = yield* userRepository.findUserByIdWithPassword(userId);

          if (!user) {
            yield* Effect.logWarning(`[AuthService] User not found`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid credentials',
              }),
            );
          }

          // Verify current password
          yield* Effect.logInfo(`[AuthService] Verifying current password`);
          const isPasswordValid = yield* passwordService.verifyPassword(currentPassword, user.passwordHash);

          if (!isPasswordValid) {
            yield* Effect.logWarning(`[AuthService] Invalid current password`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid current password',
              }),
            );
          }

          yield* Effect.logInfo(`[AuthService] Checking for password reuse`);
          const isNewPasswordSameAsOld = yield* passwordService.verifyPassword(newPassword, user.passwordHash);

          if (isNewPasswordSameAsOld) {
            yield* Effect.logWarning(`[AuthService] New password matches current password`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'New password must be different from current password',
              }),
            );
          }

          // Hash new password
          yield* Effect.logInfo(`[AuthService] Hashing new password`);
          const newPasswordHash = yield* passwordService.hashPassword(newPassword);

          // Update password in database
          yield* Effect.logInfo(`[AuthService] Updating password in database`);
          const updatedUser = yield* userRepository.updateUserPassword(user.id, newPasswordHash);

          yield* Effect.logInfo(`[AuthService] Password updated successfully for user ${updatedUser.id}`);

          return {
            id: updatedUser.id,
            email: updatedUser.email,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
          };
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Default layer with all dependencies
 */
export const AuthServiceLive = AuthService.Default.pipe(
  Layer.provide(UserRepository.Default),
  Layer.provide(PasswordService.Default),
  Layer.provide(JwtService.Default),
);
