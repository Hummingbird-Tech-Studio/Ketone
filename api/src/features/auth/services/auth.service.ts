import { Effect, Layer } from 'effect';
import { UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { PasswordService } from './password.service';

/**
 * Auth Service
 * Handles authentication business logic
 */

export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;

    return {
      /**
       * Sign up a new user
       */
      signup: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting signup for email: ${email}`);

          // Check if user already exists
          const existingUser = yield* userRepository.findUserByEmail(email);

          if (existingUser) {
            yield* Effect.logWarning(`[AuthService] User already exists with email: ${email}`);
            return yield* Effect.fail(
              new UserAlreadyExistsError({
                message: 'User with this email already exists',
                email,
              }),
            );
          }

          // Hash password
          yield* Effect.logInfo(`[AuthService] Hashing password for user: ${email}`);
          const passwordHash = yield* passwordService.hashPassword(password);

          // Create user
          yield* Effect.logInfo(`[AuthService] Creating user in database: ${email}`);
          const user = yield* userRepository.createUser(email, passwordHash);

          yield* Effect.logInfo(`[AuthService] User created successfully with id: ${user.id}`);

          return {
            id: user.id,
            email: user.email,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
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
);
