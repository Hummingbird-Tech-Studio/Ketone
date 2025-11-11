import { Data, Effect } from 'effect';

/**
 * Authentication Token Error
 */
export class AuthTokenError extends Data.TaggedError('AuthTokenError')<{
  message: string;
  cause?: unknown;
}> {}

/**
 * Authentication Token Service
 */
export class AuthTokenService extends Effect.Service<AuthTokenService>()('AuthTokenService', {
  effect: Effect.gen(function* () {
    const TOKEN_KEY = 'auth_token';

    return {
      /**
       * Store authentication token in localStorage
       * @param token - JWT token to store
       */
      setToken: (token: string): Effect.Effect<void, AuthTokenError> =>
        Effect.try({
          try: () => {
            localStorage.setItem(TOKEN_KEY, token);
          },
          catch: (error) =>
            new AuthTokenError({
              message: 'Failed to store authentication token',
              cause: error,
            }),
        }),

      /**
       * Retrieve authentication token from localStorage
       * @returns JWT token or null if not found
       */
      getToken: (): Effect.Effect<string | null, AuthTokenError> =>
        Effect.try({
          try: () => {
            return localStorage.getItem(TOKEN_KEY);
          },
          catch: (error) =>
            new AuthTokenError({
              message: 'Failed to retrieve authentication token',
              cause: error,
            }),
        }),

      /**
       * Remove authentication token from localStorage
       */
      removeToken: (): Effect.Effect<void, AuthTokenError> =>
        Effect.try({
          try: () => {
            localStorage.removeItem(TOKEN_KEY);
          },
          catch: (error) =>
            new AuthTokenError({
              message: 'Failed to remove authentication token',
              cause: error,
            }),
        }),

      /**
       * Check if user is authenticated (has valid token)
       * Note: This only checks token existence, not validity
       * @returns true if token exists, false otherwise
       */
      isAuthenticated: (): Effect.Effect<boolean, AuthTokenError> =>
        Effect.try({
          try: () => {
            return localStorage.getItem(TOKEN_KEY) !== null;
          },
          catch: (error) =>
            new AuthTokenError({
              message: 'Failed to check authentication status',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Program to check if authentication token exists
 * @returns The token if it exists, null otherwise
 */
export const programCheckToken = Effect.gen(function* () {
  const authTokenService = yield* AuthTokenService;
  return yield* authTokenService.getToken();
}).pipe(Effect.provide(AuthTokenService.Default));

/**
 * Program to store authentication token
 * @param token - The JWT token to store
 */
export const programStoreToken = (token: string) =>
  Effect.gen(function* () {
    const authTokenService = yield* AuthTokenService;
    yield* authTokenService.setToken(token);
  }).pipe(Effect.provide(AuthTokenService.Default));

/**
 * Program to remove authentication token
 */
export const programRemoveToken = Effect.gen(function* () {
  const authTokenService = yield* AuthTokenService;
  yield* authTokenService.removeToken();
}).pipe(Effect.provide(AuthTokenService.Default));
