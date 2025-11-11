import { Effect } from 'effect';
import { getUnixTime } from 'date-fns';
import { InvalidCredentialsError, UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { UserAuthCache } from './user-auth-cache.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;
    const jwtService = yield* JwtService;
    const userAuthCache = yield* UserAuthCache;

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

          const timestamp = Math.floor(user.createdAt.getTime() / 1000);
          yield* Effect.logInfo(`[AuthService] Initializing UserAuth cache (timestamp: ${timestamp})`);

          yield* userAuthCache
            .setPasswordChangedAt(user.id, timestamp)
            .pipe(
              Effect.catchAll((error) =>
                Effect.logWarning(`[AuthService] Failed to initialize UserAuth cache: ${error}`),
              ),
            );

          yield* Effect.logInfo(`[AuthService] Generating JWT token`);
          const token = yield* jwtService.generateToken(user.id, user.email, user.createdAt);

          yield* Effect.logInfo(`[AuthService] Signup completed successfully with id: ${user.id}`);

          return {
            token,
            user: {
              id: user.id,
              email: user.email,
            },
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

          const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
          const token = yield* jwtService.generateToken(user.id, user.email, passwordChangedAt);
          const timestamp = getUnixTime(passwordChangedAt);

          yield* Effect.logInfo(`[AuthService] Synchronizing UserAuth cache (timestamp: ${timestamp})`);

          yield* userAuthCache
            .setPasswordChangedAt(user.id, timestamp)
            .pipe(
              Effect.catchAll((error) => Effect.logWarning(`[AuthService] Failed to sync UserAuth cache: ${error}`)),
            );

          yield* Effect.logInfo(`[AuthService] User logged in successfully with id: ${user.id}`);

          return {
            token,
            user: {
              id: user.id,
              email: user.email,
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

          // Use passwordChangedAt from database (should never be null after update, but fallback to updatedAt for safety)
          const passwordChangedAt = updatedUser.passwordChangedAt ?? updatedUser.updatedAt;
          const passwordChangedAtTimestamp = getUnixTime(passwordChangedAt);
          yield* Effect.logInfo(
            `[AuthService] Updating UserAuth cache about password change (timestamp: ${passwordChangedAtTimestamp})`,
          );

          yield* userAuthCache.setPasswordChangedAt(userId, passwordChangedAtTimestamp);

          yield* Effect.logInfo(`[AuthService] Password updated successfully for user ${updatedUser.id}`);

          return {
            id: updatedUser.id,
            email: updatedUser.email,
          };
        }),
    };
  }),
  dependencies: [UserRepository.Default, PasswordService.Default, JwtService.Default, UserAuthCache.Default],
  accessors: true,
}) {}
