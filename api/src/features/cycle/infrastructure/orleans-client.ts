import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { Data, Effect, Layer, Schema as S } from 'effect';

/**
 * Orleans Sidecar Client
 *
 * Communicates with the .NET Orleans sidecar running on localhost:5174
 * to manage actor state persistence.
 */

// ============================================================================
// Configuration
// ============================================================================

const ORLEANS_BASE_URL = 'http://localhost:5174';

// ============================================================================
// Error Types (Domain Errors)
// ============================================================================

export class OrleansClientError extends Data.TaggedError('OrleansClientError')<{
  message: string;
  cause?: unknown;
}> {}

export class OrleansActorNotFoundError extends Data.TaggedError(
  'OrleansActorNotFoundError'
)<{
  actorId: string;
  message: string;
}> {}

/**
 * Orleans Actor State Schema
 *
 * This should be the full XState persisted snapshot, not just {value, context}.
 * Using S.Unknown to accept any JSON structure that XState's getPersistedSnapshot() returns.
 *
 * The persisted snapshot includes:
 * - status, output, error
 * - machine metadata
 * - children, historyValue
 * - value (current state)
 * - context (state data)
 */
export const OrleansActorStateSchema = S.Unknown;
export type OrleansActorState = S.Schema.Type<typeof OrleansActorStateSchema>;

// ============================================================================
// Effect Program for Persistence
// ============================================================================

/**
 * Effect program to persist actor state to Orleans
 * This is used by the XState machine to orchestrate persistence
 */
export const programPersistToOrleans = (
  actorId: string,
  state: OrleansActorState
) =>
  Effect.gen(function* () {
    const client = yield* OrleansClient;
    yield* client.persistActor(actorId, state);
  }).pipe(
    Effect.provide(
      OrleansClient.Default.pipe(Layer.provide(FetchHttpClient.layer))
    )
  );

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Orleans Client Service - HTTP client for Orleans sidecar communication
 */
export class OrleansClient extends Effect.Service<OrleansClient>()(
  'OrleansClient',
  {
    effect: Effect.gen(function* () {
      const httpClient = yield* HttpClient.HttpClient;

      return {
        /**
         * Check if an actor exists in Orleans
         * Returns the actor state if found, throws OrleansActorNotFoundError if 404
         */
        getActor: (actorId: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `[Orleans Client] GET ${ORLEANS_BASE_URL}/actors/${actorId}`
            );

            const request = HttpClientRequest.get(
              `${ORLEANS_BASE_URL}/actors/${actorId}`
            );

            const httpResponse = yield* httpClient.execute(request).pipe(
              Effect.tapError((error) =>
                Effect.logError('Connection error').pipe(
                  Effect.annotateLogs({ error: String(error) })
                )
              ),
              Effect.mapError(
                (error) =>
                  new OrleansClientError({
                    message: 'Failed to connect to Orleans sidecar',
                    cause: error,
                  })
              )
            );

            yield* Effect.logInfo(
              `[Orleans Client] Response status: ${httpResponse.status}`
            );

            // Check for 404 - actor not found
            if (httpResponse.status === 404) {
              yield* Effect.logInfo(
                `[Orleans Client] Actor ${actorId} not found (404)`
              );
              return yield* Effect.fail(
                new OrleansActorNotFoundError({
                  actorId,
                  message: `Actor ${actorId} not found in Orleans`,
                })
              );
            }

            // Check for other non-200 status codes
            if (httpResponse.status !== 200) {
              yield* Effect.logError(
                `[Orleans Client] Unexpected status: ${httpResponse.status}`
              );
              return yield* Effect.fail(
                new OrleansClientError({
                  message: `Failed to get actor from Orleans: HTTP ${httpResponse.status}`,
                  cause: httpResponse,
                })
              );
            }

            // Parse and validate response body
            const state = yield* HttpClientResponse.schemaBodyJson(
              OrleansActorStateSchema
            )(httpResponse).pipe(
              Effect.tapError((error) =>
                Effect.logError('Failed to decode response').pipe(
                  Effect.annotateLogs({ error: String(error) })
                )
              ),
              Effect.mapError(
                (error) =>
                  new OrleansClientError({
                    message: 'Failed to decode actor state from Orleans',
                    cause: error,
                  })
              )
            );

            yield* Effect.logInfo('✅ Actor state retrieved successfully').pipe(
              Effect.annotateLogs({ state: JSON.stringify(state) })
            );

            return state;
          }),

        /**
         * Persist actor state to Orleans
         * Creates or updates the actor with the given state
         */
        persistActor: (actorId: string, state: OrleansActorState) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `POST ${ORLEANS_BASE_URL}/actors/${actorId}`
            ).pipe(
              Effect.annotateLogs({
                requestBody: JSON.stringify(state),
                actorId,
              })
            );

            const request = yield* HttpClientRequest.post(
              `${ORLEANS_BASE_URL}/actors/${actorId}`
            ).pipe(HttpClientRequest.bodyJson(state));

            const httpResponse = yield* httpClient.execute(request).pipe(
              Effect.tapError((error) =>
                Effect.logError('Connection error').pipe(
                  Effect.annotateLogs({
                    error: String(error),
                    actorId,
                  })
                )
              ),
              Effect.mapError(
                (error) =>
                  new OrleansClientError({
                    message: 'Failed to connect to Orleans sidecar',
                    cause: error,
                  })
              )
            );

            yield* Effect.logInfo(`Response status: ${httpResponse.status}`);

            // Check for success status codes
            if (httpResponse.status !== 200 && httpResponse.status !== 201) {
              yield* Effect.logError(
                `Failed to persist: HTTP ${httpResponse.status}`
              ).pipe(Effect.annotateLogs({ actorId }));

              return yield* Effect.fail(
                new OrleansClientError({
                  message: `Failed to persist actor to Orleans: HTTP ${httpResponse.status}`,
                  cause: httpResponse,
                })
              );
            }

            yield* Effect.logInfo(`✅ Actor state persisted to Orleans`).pipe(
              Effect.annotateLogs({ actorId })
            );
          }),
      };
    }),
    accessors: true,
  }
) {}
