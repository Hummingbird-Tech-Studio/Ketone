import { StorageService } from '@/services/storage';
import type { UserResponseSchema } from '@ketone/shared';
import { Data, Effect } from 'effect';

/**
 * Authentication Session Type
 */
export type AuthSession = {
  token: string;
  user: UserResponseSchema;
};

/**
 * Authentication Session Error
 */
export class AuthSessionError extends Data.TaggedError('AuthSessionError')<{
  message: string;
  cause?: unknown;
}> {}

const SESSION_STORAGE_KEY = 'auth_session';

/**
 * Authentication Session Service
 */
export class AuthSessionService extends Effect.Service<AuthSessionService>()('AuthSessionService', {
  effect: Effect.gen(function* () {
    const storageService = yield* StorageService;

    return {
      /**
       * Store authentication session
       * @param session - Auth session (token + user) to store
       */
      setSession: (session: AuthSession): Effect.Effect<void, AuthSessionError> =>
        storageService.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)).pipe(
          Effect.mapError(
            (error) =>
              new AuthSessionError({
                message: 'Failed to store authentication session',
                cause: error,
              }),
          ),
        ),

      /**
       * Retrieve authentication session
       * @returns Auth session or null if not found
       */
      getSession: (): Effect.Effect<AuthSession | null, AuthSessionError> =>
        Effect.gen(function* () {
          const sessionJson = yield* storageService.getItem(SESSION_STORAGE_KEY).pipe(
            Effect.mapError(
              (error) =>
                new AuthSessionError({
                  message: 'Failed to retrieve authentication session',
                  cause: error,
                }),
            ),
          );

          if (!sessionJson) {
            return null;
          }

          return yield* Effect.try({
            try: () => JSON.parse(sessionJson) as AuthSession,
            catch: (error) =>
              new AuthSessionError({
                message: 'Failed to parse authentication session',
                cause: error,
              }),
          });
        }),

      /**
       * Remove authentication session
       */
      removeSession: (): Effect.Effect<void, AuthSessionError> =>
        storageService.removeItem(SESSION_STORAGE_KEY).pipe(
          Effect.mapError(
            (error) =>
              new AuthSessionError({
                message: 'Failed to remove authentication session',
                cause: error,
              }),
          ),
        ),

      /**
       * Check if user is authenticated (has valid session)
       * @returns true if session exists, false otherwise
       */
      isAuthenticated: (): Effect.Effect<boolean, AuthSessionError> =>
        storageService.getItem(SESSION_STORAGE_KEY).pipe(
          Effect.map((session) => session !== null),
          Effect.mapError(
            (error) =>
              new AuthSessionError({
                message: 'Failed to check authentication status',
                cause: error,
              }),
          ),
        ),

      /**
       * Update user email in the stored session
       * @param email - New email address
       */
      updateSessionEmail: (email: string): Effect.Effect<void, AuthSessionError> =>
        Effect.gen(function* () {
          const sessionJson = yield* storageService.getItem(SESSION_STORAGE_KEY).pipe(
            Effect.mapError(
              (error) =>
                new AuthSessionError({
                  message: 'Failed to retrieve authentication session',
                  cause: error,
                }),
            ),
          );

          if (!sessionJson) {
            return;
          }

          const session = yield* Effect.try({
            try: () => JSON.parse(sessionJson) as AuthSession,
            catch: (error) =>
              new AuthSessionError({
                message: 'Failed to parse authentication session',
                cause: error,
              }),
          });

          const updatedSession = {
            ...session,
            user: { ...session.user, email },
          };

          yield* storageService.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedSession)).pipe(
            Effect.mapError(
              (error) =>
                new AuthSessionError({
                  message: 'Failed to update authentication session',
                  cause: error,
                }),
            ),
          );
        }),
    };
  }),
  dependencies: [StorageService.Default],
  accessors: true,
}) {}

/**
 * Program to check if authentication session exists
 * @returns The session if it exists, null otherwise
 */
export const programCheckSession = Effect.gen(function* () {
  const authSessionService = yield* AuthSessionService;
  return yield* authSessionService.getSession();
}).pipe(Effect.provide(AuthSessionService.Default));

/**
 * Program to store authentication session
 * @param session - The auth session (token + user) to store
 */
export const programStoreSession = (session: AuthSession) =>
  Effect.gen(function* () {
    const authSessionService = yield* AuthSessionService;
    yield* authSessionService.setSession(session);
  }).pipe(Effect.provide(AuthSessionService.Default));

/**
 * Program to remove authentication session
 */
export const programRemoveSession = Effect.gen(function* () {
  const authSessionService = yield* AuthSessionService;
  yield* authSessionService.removeSession();
}).pipe(Effect.provide(AuthSessionService.Default));

/**
 * Program to update user email in the stored session
 * @param email - New email address
 */
export const programUpdateSessionEmail = (email: string) =>
  Effect.gen(function* () {
    const authSessionService = yield* AuthSessionService;
    yield* authSessionService.updateSessionEmail(email);
  }).pipe(Effect.provide(AuthSessionService.Default));
