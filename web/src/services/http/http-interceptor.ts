import { authenticationActor, Event } from '@/actors/authenticationActor';
import { HttpStatus } from '@/shared/constants/http-status';
import { HttpClient, HttpClientError } from '@effect/platform';
import { Effect, Layer } from 'effect';

/**
 * HTTP Response Interceptor
 * Handles 401 Unauthorized responses by deauthenticating the user
 */
export const create401Interceptor = (client: HttpClient.HttpClient) =>
  HttpClient.transform(client, (effect) =>
    effect.pipe(
      Effect.tap((response) => {
        if (response.status === HttpStatus.Unauthorized) {
          return Effect.sync(() => authenticationActor.send({ type: Event.DEAUTHENTICATE }));
        }
        return Effect.void;
      }),
      Effect.tapError((error) => {
        if (HttpClientError.isHttpClientError(error)) {
          const httpError = error as HttpClientError.ResponseError;
          if (httpError.response?.status === HttpStatus.Unauthorized) {
            return Effect.sync(() => authenticationActor.send({ type: Event.DEAUTHENTICATE }));
          }
        }
        return Effect.void;
      }),
    ),
  );

/**
 * HTTP Client Layer with 401 interceptor
 * Use this layer in services that need automatic 401 handling
 */
export const HttpClientWith401Interceptor = Layer.effect(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return create401Interceptor(client);
  }),
);
