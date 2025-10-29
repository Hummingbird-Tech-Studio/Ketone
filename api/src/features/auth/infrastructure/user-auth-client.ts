import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Data, Effect, Schema as S } from 'effect';

/**
 * UserAuth Orleans Client
 *
 * Communicates with the .NET Orleans sidecar to manage user authentication state
 * in memory for fast token validation.
 */

// ============================================================================
// Configuration
// ============================================================================

const ORLEANS_BASE_URL = Bun.env.ORLEANS_BASE_URL || 'http://localhost:5174';

// ============================================================================
// Error Types (Domain Errors)
// ============================================================================

export class UserAuthClientError extends Data.TaggedError('UserAuthClientError')<{
  message: string;
  cause?: unknown;
}> {}

// ============================================================================
// Response Schemas
// ============================================================================

const PasswordChangedAtResponseSchema = S.Struct({
  userId: S.String,
  passwordChangedAt: S.NullOr(S.Number),
});

const ValidateTokenResponseSchema = S.Struct({
  userId: S.String,
  tokenIssuedAt: S.Number,
  isValid: S.Boolean,
});

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * UserAuth Client Service - HTTP client for UserAuth grain communication
 */
export class UserAuthClient extends Effect.Service<UserAuthClient>()('UserAuthClient', {
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    return {
      /**
       * Set the password change timestamp for a user
       * This should be called when a user changes their password
       */
      setPasswordChangedAt: (userId: string, timestamp: number) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserAuthClient] POST ${ORLEANS_BASE_URL}/user-auth/${userId}/password-changed-at`);

          const request = HttpClientRequest.post(
            `${ORLEANS_BASE_URL}/user-auth/${userId}/password-changed-at?timestamp=${timestamp}`,
          );

          const httpResponse = yield* httpClient.execute(request).pipe(
            Effect.tapError((error) =>
              Effect.logError('Connection error to Orleans').pipe(Effect.annotateLogs({ error: String(error) })),
            ),
            Effect.mapError(
              (error) =>
                new UserAuthClientError({
                  message: 'Failed to connect to Orleans sidecar',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`[UserAuthClient] Response status: ${httpResponse.status}`);

          if (httpResponse.status !== 200) {
            yield* Effect.logError(
              `[UserAuthClient] Failed to set password changed timestamp: HTTP ${httpResponse.status}`,
            );
            return yield* Effect.fail(
              new UserAuthClientError({
                message: `Failed to set password changed timestamp: HTTP ${httpResponse.status}`,
                cause: httpResponse,
              }),
            );
          }

          const response = yield* HttpClientResponse.schemaBodyJson(PasswordChangedAtResponseSchema)(httpResponse).pipe(
            Effect.mapError(
              (error) =>
                new UserAuthClientError({
                  message: 'Failed to decode response from Orleans',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo('✅ Password changed timestamp set successfully').pipe(
            Effect.annotateLogs({ userId, timestamp: response.passwordChangedAt }),
          );

          return response.passwordChangedAt;
        }),

      /**
       * Validate a token by checking if it was issued after the last password change
       * Returns true if the token is valid, false if it should be rejected
       */
      validateToken: (userId: string, tokenIssuedAt: number) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(
            `[UserAuthClient] POST ${ORLEANS_BASE_URL}/user-auth/${userId}/validate-token (iat=${tokenIssuedAt})`,
          );

          const request = HttpClientRequest.post(
            `${ORLEANS_BASE_URL}/user-auth/${userId}/validate-token?tokenIssuedAt=${tokenIssuedAt}`,
          );

          const httpResponse = yield* httpClient.execute(request).pipe(
            Effect.tapError((error) =>
              Effect.logError('Connection error to Orleans').pipe(Effect.annotateLogs({ error: String(error) })),
            ),
            Effect.mapError(
              (error) =>
                new UserAuthClientError({
                  message: 'Failed to connect to Orleans sidecar',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`[UserAuthClient] Response status: ${httpResponse.status}`);

          if (httpResponse.status !== 200) {
            yield* Effect.logError(`[UserAuthClient] Failed to validate token: HTTP ${httpResponse.status}`);
            return yield* Effect.fail(
              new UserAuthClientError({
                message: `Failed to validate token: HTTP ${httpResponse.status}`,
                cause: httpResponse,
              }),
            );
          }

          const response = yield* HttpClientResponse.schemaBodyJson(ValidateTokenResponseSchema)(httpResponse).pipe(
            Effect.mapError(
              (error) =>
                new UserAuthClientError({
                  message: 'Failed to decode response from Orleans',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo('✅ Token validation completed').pipe(
            Effect.annotateLogs({ userId, isValid: response.isValid }),
          );

          return response.isValid;
        }),
    };
  }),
  accessors: true,
}) {}
