import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Effect } from 'effect';
import { UnauthorizedError } from './errors';
import type { AuthSession } from '../../actors/authentication.actor';

/**
 * Auth Session Service Interface
 * Platform-specific implementations should provide this interface
 */
export type AuthSessionServiceInterface = {
  getSession: () => Effect.Effect<AuthSession | null, unknown>;
};

/**
 * Authenticated HTTP Client Factory
 * Creates an HTTP client that automatically adds Bearer token authentication
 *
 * @param authActor - The authentication actor with a send method
 * @param deauthEvent - The event to send when authentication fails
 * @param getSession - Function to retrieve the current session
 */
export const createAuthenticatedHttpClient = <TEvent extends { type: string }>(
  authActor: { send: (event: TEvent) => void },
  deauthEvent: TEvent,
  getSession: () => Effect.Effect<AuthSession | null, unknown>,
) => ({
  /**
   * Execute an HTTP request with Bearer token authentication
   * @param request - The HTTP request to execute
   * @returns The HTTP response
   * @throws UnauthorizedError if no valid session exists
   */
  execute: (
    request: HttpClientRequest.HttpClientRequest,
  ): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError | UnauthorizedError, HttpClient.HttpClient> =>
    Effect.gen(function* () {
      const session = yield* getSession().pipe(
        Effect.mapError((error) => {
          authActor.send(deauthEvent);
          return new UnauthorizedError({
            message: `Failed to retrieve authentication session: ${String(error)}`,
          });
        }),
      );

      if (!session) {
        authActor.send(deauthEvent);
        return yield* Effect.fail(
          new UnauthorizedError({
            message: 'Not authenticated - no valid session found',
          }),
        );
      }

      const httpClient = yield* HttpClient.HttpClient;
      const authenticatedRequest = HttpClientRequest.bearerToken(session.token)(request);
      return yield* httpClient.execute(authenticatedRequest);
    }),
});

export type AuthenticatedHttpClientType = ReturnType<typeof createAuthenticatedHttpClient>;
