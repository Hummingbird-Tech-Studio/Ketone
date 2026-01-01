import { HttpClient, HttpClientError } from '@effect/platform';
import { Effect, Layer } from 'effect';
import { HttpStatus } from '../../constants/http-status';

/**
 * HTTP Response Interceptor Factory
 * Creates a 401 interceptor that handles unauthorized responses by triggering deauthentication
 *
 * @param authActor - The authentication actor with a send method
 * @param deauthEvent - The event to send when a 401 is received
 */
export const create401Interceptor =
  <TEvent extends { type: string }>(authActor: { send: (event: TEvent) => void }, deauthEvent: TEvent) =>
  (client: HttpClient.HttpClient) =>
    HttpClient.transform(client, (effect) =>
      effect.pipe(
        Effect.tap((response) => {
          if (response.status === HttpStatus.Unauthorized) {
            return Effect.sync(() => authActor.send(deauthEvent));
          }
          return Effect.void;
        }),
        Effect.tapError((error) => {
          if (HttpClientError.isHttpClientError(error)) {
            const httpError = error as HttpClientError.ResponseError;
            if (httpError.response?.status === HttpStatus.Unauthorized) {
              return Effect.sync(() => authActor.send(deauthEvent));
            }
          }
          return Effect.void;
        }),
      ),
    );

/**
 * HTTP Client Layer Factory with 401 interceptor
 * Creates a layer that wraps the HttpClient with automatic 401 handling
 *
 * @param authActor - The authentication actor with a send method
 * @param deauthEvent - The event to send when a 401 is received
 */
export const createHttpClientWith401Interceptor = <TEvent extends { type: string }>(
  authActor: { send: (event: TEvent) => void },
  deauthEvent: TEvent,
) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      return create401Interceptor(authActor, deauthEvent)(client);
    }),
  );
