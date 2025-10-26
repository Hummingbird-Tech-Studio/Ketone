import { Effect, Layer } from 'effect';
import { InvalidCredentialsError, UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

/**
 * Auth Service
 * Handles authentication business logic
 */

export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;
    const jwtService = yield* JwtService;

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

      /**
       * Login user and generate JWT token
       */
      login: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[AuthService] Starting login process`);

          // Find user with password hash
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
