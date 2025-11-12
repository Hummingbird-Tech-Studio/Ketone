import { authenticationActor, Event } from '@/actors/authenticationActor';
import { AuthSessionService } from '@/services/auth/auth-session.service';
import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Data, Effect } from 'effect';

/**
 * Unauthorized Error - thrown when no valid session exists
 */
export class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{
  message: string;
}> {}

/**
 * Authenticated HTTP Client Service
 */
export class AuthenticatedHttpClient extends Effect.Service<AuthenticatedHttpClient>()('AuthenticatedHttpClient', {
  effect: Effect.gen(function* () {
    const authSession = yield* AuthSessionService;
    const httpClient = yield* HttpClient.HttpClient;

    return {
      /**
       * Execute an HTTP request with Bearer token authentication
       * @param request - The HTTP request to execute
       * @returns The HTTP response
       * @throws UnauthorizedError if no valid session exists
       */
      execute: (
        request: HttpClientRequest.HttpClientRequest,
      ): Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError | UnauthorizedError> =>
        Effect.gen(function* () {
          const session = yield* authSession.getSession().pipe(
            Effect.mapError((error) => {
              authenticationActor.send({ type: Event.DEAUTHENTICATE });
              return new UnauthorizedError({
                message: `Failed to retrieve authentication session: ${error.message}`,
              });
            }),
          );

          if (!session) {
            authenticationActor.send({ type: Event.DEAUTHENTICATE });
            return yield* Effect.fail(
              new UnauthorizedError({
                message: 'Not authenticated - no valid session found',
              }),
            );
          }

          const authenticatedRequest = HttpClientRequest.bearerToken(session.token)(request);
          return yield* httpClient.execute(authenticatedRequest);
        }),
    };
  }),
  dependencies: [AuthSessionService.Default],
  accessors: true,
}) {}

/**
 * Live implementation of AuthenticatedHttpClient
 * Provides AuthSessionService dependency
 */
export const AuthenticatedHttpClientLive = AuthenticatedHttpClient.Default;
