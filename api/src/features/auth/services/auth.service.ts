import { Effect } from 'effect';
import { getUnixTime } from 'date-fns';
import { InvalidCredentialsError, UserAlreadyExistsError } from '../domain';
import { UserRepository } from '../repositories';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { UserAuthCache } from './user-auth-cache.service';

export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.gen(function* () {
    const userRepository = yield* UserRepository;
    const passwordService = yield* PasswordService;
    const jwtService = yield* JwtService;
    const userAuthCache = yield* UserAuthCache;

    return {
      signup: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Starting signup process');

          const existingUser = yield* userRepository.findUserByEmail(email);

          if (existingUser) {
            yield* Effect.logWarning('User already exists');
            return yield* Effect.fail(
              new UserAlreadyExistsError({
                message: 'User with this email already exists',
                email,
              }),
            );
          }

          yield* Effect.logInfo('Hashing password');
          const passwordHash = yield* passwordService.hashPassword(password);

          yield* Effect.logInfo('Creating user in database');
          const user = yield* userRepository.createUser(email, passwordHash);

          yield* Effect.logInfo(`User created successfully with id: ${user.id}`);

          const timestamp = getUnixTime(user.createdAt);
          yield* Effect.logInfo(`Initializing UserAuth cache (timestamp: ${timestamp})`);

          yield* userAuthCache
            .setPasswordChangedAt(user.id, timestamp)
            .pipe(
              Effect.catchAll((error) =>
                Effect.logWarning(`Failed to initialize UserAuth cache: ${error}`),
              ),
            );

          yield* Effect.logInfo('Generating JWT token');
          const token = yield* jwtService.generateToken(user.id, user.email, user.createdAt);

          yield* Effect.logInfo(`Signup completed successfully with id: ${user.id}`);

          return {
            token,
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
            },
          };
        }).pipe(Effect.annotateLogs({ service: 'AuthService' })),
      login: (email: string, password: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Starting login process');

          const user = yield* userRepository.findUserByEmailWithPassword(email);

          if (!user) {
            yield* Effect.logWarning('User not found');
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid email or password',
              }),
            );
          }

          yield* Effect.logInfo('Verifying password');
          const isPasswordValid = yield* passwordService.verifyPassword(password, user.passwordHash);

          if (!isPasswordValid) {
            yield* Effect.logWarning('Invalid password');
            return yield* Effect.fail(
              new InvalidCredentialsError({
                message: 'Invalid email or password',
              }),
            );
          }

          yield* Effect.logInfo('Generating JWT token');

          const passwordChangedAt = user.passwordChangedAt ?? user.createdAt;
          const token = yield* jwtService.generateToken(user.id, user.email, passwordChangedAt);
          const timestamp = getUnixTime(passwordChangedAt);

          yield* Effect.logInfo(`Synchronizing UserAuth cache (timestamp: ${timestamp})`);

          yield* userAuthCache
            .setPasswordChangedAt(user.id, timestamp)
            .pipe(
              Effect.catchAll((error) => Effect.logWarning(`Failed to sync UserAuth cache: ${error}`)),
            );

          yield* Effect.logInfo(`User logged in successfully with id: ${user.id}`);

          return {
            token,
            user: {
              id: user.id,
              email: user.email,
              createdAt: user.createdAt.toISOString(),
              updatedAt: user.updatedAt.toISOString(),
            },
          };
        }).pipe(Effect.annotateLogs({ service: 'AuthService' })),
    };
  }),
  dependencies: [UserRepository.Default, PasswordService.Default, JwtService.Default, UserAuthCache.Default],
  accessors: true,
}) {}
