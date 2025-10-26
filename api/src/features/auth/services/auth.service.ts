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
