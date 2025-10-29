import { FetchHttpClient } from '@effect/platform';
import { Effect, Layer } from 'effect';
import { InvalidCredentialsError, UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { UserAuthClient } from '../infrastructure/user-auth-client';
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
    const userAuthClient = yield* UserAuthClient;

    return {
      signup: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting signup process`);

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

          yield* Effect.logInfo(`[AuthService] Hashing password`);
          const passwordHash = yield* passwordService.hashPassword(password);

          yield* Effect.logInfo(`[AuthService] Creating user in database`);
          const user = yield* userRepository.createUser(email, passwordHash);

          yield* Effect.logInfo(`[AuthService] User created successfully with id: ${user.id}`);

          // Initialize Orleans UserAuth actor with createdAt as baseline
          // This ensures token validation works correctly from the start
          const timestamp = Math.floor(user.createdAt.getTime() / 1000);
          yield* Effect.logInfo(
            `[AuthService] Initializing Orleans auth state (timestamp: ${timestamp})`,
          );

          yield* userAuthClient.setPasswordChangedAt(user.id, timestamp).pipe(
            Effect.catchAll((error) =>
              // Log error but don't fail signup - Orleans initialization is not critical
              Effect.logWarning(`[AuthService] Failed to initialize Orleans auth state: ${error}`),
            ),
          );

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

          yield* Effect.logInfo(`[AuthService] Generating JWT token`);
          // Use passwordChangedAt if available, otherwise use createdAt as baseline
          const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
          const token = yield* jwtService.generateToken(user.id, user.email, passwordChangedAt);

          // Ensure Orleans UserAuth actor is synchronized with DB state
          // This handles users created before Orleans implementation or after Orleans downtime
          const timestamp = Math.floor(passwordChangedAt.getTime() / 1000);
          yield* Effect.logInfo(
            `[AuthService] Synchronizing Orleans auth state (timestamp: ${timestamp})`,
          );

          yield* userAuthClient.setPasswordChangedAt(user.id, timestamp).pipe(
            Effect.catchAll((error) =>
              // Log error but don't fail login - Orleans sync is not critical for login
              Effect.logWarning(`[AuthService] Failed to sync Orleans auth state: ${error}`),
            ),
          );

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

          const user = yield* userRepository.findUserByIdWithPassword(userId);

          if (!user) {
            yield* Effect.logWarning(`[AuthService] User not found`);
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid credentials',
              }),
            );
          }

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

          yield* Effect.logInfo(`[AuthService] Hashing new password`);
          const newPasswordHash = yield* passwordService.hashPassword(newPassword);

          yield* Effect.logInfo(`[AuthService] Updating password in database`);
          const updatedUser = yield* userRepository.updateUserPassword(user.id, newPasswordHash);

          // Notify Orleans UserAuth actor about password change to invalidate old tokens
          const passwordChangedAtTimestamp = Math.floor(Date.now() / 1000);
          yield* Effect.logInfo(
            `[AuthService] Notifying Orleans about password change (timestamp: ${passwordChangedAtTimestamp})`,
          );

          yield* userAuthClient.setPasswordChangedAt(userId, passwordChangedAtTimestamp).pipe(
            Effect.catchAll((error) =>
              // Log error but don't fail the request - password was already updated in DB
              Effect.logWarning(`[AuthService] Failed to notify Orleans about password change: ${error}`),
            ),
          );

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
  Layer.provide(UserAuthClient.Default.pipe(Layer.provide(FetchHttpClient.layer))),
);
