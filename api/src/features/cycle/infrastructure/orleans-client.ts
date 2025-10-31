import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Effect, Layer, Schema as S } from 'effect';
import { OrleansActorNotFoundError, OrleansClientError } from './index';

const ORLEANS_BASE_URL = 'http://localhost:5174';

/**
 * Base Actor State Schema - Shared structure
 * We define the base structure and then extend it with different date types
 */
const BaseActorStateSchema = {
  value: S.String,
  status: S.optional(S.String),
  output: S.optional(S.Unknown),
  error: S.optional(S.Unknown),
  children: S.optional(S.Unknown),
  historyValue: S.optional(S.Unknown),
};

/**
 * Backward-Compatible Context Schema
 *
 * This schema accepts both the legacy `actorId` field and the new `userId` field.
 * It automatically migrates old data by using `userId` if present, otherwise falling back to `actorId`.
 * This ensures zero-downtime migration of existing Orleans data.
 */
const BackwardCompatibleContextSchema = S.Struct({
  id: S.NullOr(S.String),
  userId: S.optional(S.NullOr(S.String)), // New field (optional for backward compatibility)
  actorId: S.optional(S.NullOr(S.String)), // Legacy field (optional for backward compatibility)
  startDate: S.Unknown,
  endDate: S.Unknown,
}).pipe(
  S.transform(
    S.Struct({
      id: S.NullOr(S.String),
      userId: S.NullOr(S.String),
      startDate: S.Unknown,
      endDate: S.Unknown,
    }),
    {
      decode: (input) => ({
        id: input.id,
        // Migration: use userId if present, otherwise fall back to actorId
        userId: input.userId ?? input.actorId ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
      encode: (output) => ({
        id: output.id,
        userId: output.userId, // Always encode with userId (new format)
        startDate: output.startDate,
        endDate: output.endDate,
      }),
    },
  ),
);

/**
 * Context Schema for Writing - Only uses userId (new format)
 */
const WriteContextSchema = {
  id: S.NullOr(S.String),
  userId: S.NullOr(S.String),
};

/**
 * Orleans Actor State Schema - For Reading from Orleans
 * Uses backward-compatible schema to handle both actorId (legacy) and userId (current)
 * Dates come as Unknown since Orleans may return them as Date objects or ISO strings
 * Handler will normalize them to Date objects
 */
export const OrleansActorStateSchema = S.Struct({
  ...BaseActorStateSchema,
  context: BackwardCompatibleContextSchema,
});

export type OrleansActorState = S.Schema.Type<typeof OrleansActorStateSchema>;

/**
 * XState Snapshot Schema - For Writing to Orleans
 * We validate the structure but not the date types since they can be Date objects,
 * ISO strings, or null. JSON.stringify will handle the serialization correctly.
 * Uses WriteContextSchema to ensure we only write userId (new format)
 */
const XStateSnapshotSchema = S.Struct({
  ...BaseActorStateSchema,
  context: S.Struct({
    ...WriteContextSchema,
    // We don't validate date types here - just ensure the field exists
    // JSON.stringify will convert Date objects to ISO strings automatically
    startDate: S.Unknown,
    endDate: S.Unknown,
  }),
});

/**
 * XState Snapshot Schema for Service Responses - Flexible Date Handling
 * This schema validates XState snapshots returned from our service methods.
 * Uses backward-compatible schema to handle both actorId (legacy) and userId (current)
 * Dates can be Date objects or ISO strings, handled flexibly.
 */
export const XStateServiceSnapshotSchema = S.Struct({
  ...BaseActorStateSchema,
  context: BackwardCompatibleContextSchema,
});

/**
 * Type definition for XState snapshots from service
 * Provides type-safe access with flexible date handling
 */
export const XStateSnapshotWithDatesSchema = XStateServiceSnapshotSchema;

// ============================================================================
// Effect Program for Persistence
// ============================================================================

/**
 * Effect program to persist actor state to Orleans
 * This is used by the XState machine to orchestrate persistence
 */
export const programPersistToOrleans = (userId: string, state: unknown) =>
  Effect.gen(function* () {
    const client = yield* OrleansClient;
    yield* client.persistActor(userId, state);
  }).pipe(Effect.provide(OrleansClient.Default.pipe(Layer.provide(FetchHttpClient.layer))));

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Orleans Client Service - HTTP client for Orleans sidecar communication
 */
export class OrleansClient extends Effect.Service<OrleansClient>()('OrleansClient', {
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    return {
      /**
       * Check if an actor exists in Orleans
       * Returns the actor state if found, throws OrleansActorNotFoundError if 404
       */
      getActor: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Orleans Client] GET ${ORLEANS_BASE_URL}/actors/${userId}`);

          const request = HttpClientRequest.get(`${ORLEANS_BASE_URL}/actors/${userId}`);

          const httpResponse = yield* httpClient.execute(request).pipe(
            Effect.tapError((error) =>
              Effect.logError('Connection error').pipe(Effect.annotateLogs({ error: String(error) })),
            ),
            Effect.mapError(
              (error) =>
                new OrleansClientError({
                  message: 'Failed to connect to Orleans sidecar',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`[Orleans Client] Response status: ${httpResponse.status}`);

          // Check for 404 - actor not found
          if (httpResponse.status === 404) {
            yield* Effect.logInfo(`[Orleans Client] Actor ${userId} not found (404)`);
            return yield* Effect.fail(
              new OrleansActorNotFoundError({
                userId,
                message: `Actor ${userId} not found in Orleans`,
              }),
            );
          }

          // Check for other non-200 status codes
          if (httpResponse.status !== 200) {
            yield* Effect.logError(`[Orleans Client] Unexpected status: ${httpResponse.status}`);
            return yield* Effect.fail(
              new OrleansClientError({
                message: `Failed to get actor from Orleans: HTTP ${httpResponse.status}`,
                cause: httpResponse,
              }),
            );
          }

          // Parse and validate response body
          const state = yield* HttpClientResponse.schemaBodyJson(OrleansActorStateSchema)(httpResponse).pipe(
            Effect.tapError((error) =>
              Effect.logError('Failed to decode response').pipe(Effect.annotateLogs({ error: String(error) })),
            ),
            Effect.mapError(
              (error) =>
                new OrleansClientError({
                  message: 'Failed to decode actor state from Orleans',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo('✅ Actor state retrieved successfully').pipe(
            Effect.annotateLogs({ state: JSON.stringify(state) }),
          );

          return state;
        }),

      /**
       * Persist actor state to Orleans
       * Creates or updates the actor with the given state
       * Validates the XState snapshot structure and serializes dates to ISO strings
       */
      persistActor: (userId: string, state: unknown) =>
        Effect.gen(function* () {
          // Validate XState snapshot structure (with Date objects)
          const validatedSnapshot = yield* S.decodeUnknown(XStateSnapshotSchema)(state).pipe(
            Effect.mapError(
              (error) =>
                new OrleansClientError({
                  message: 'Invalid XState snapshot structure',
                  cause: error,
                }),
            ),
          );

          // Serialize to Orleans format (Date objects -> ISO strings)
          // JSON.stringify automatically converts Date objects to ISO strings
          const serializedState = JSON.parse(JSON.stringify(validatedSnapshot));

          yield* Effect.logInfo(`POST ${ORLEANS_BASE_URL}/actors/${userId}`).pipe(
            Effect.annotateLogs({
              requestBody: JSON.stringify(serializedState),
              userId,
            }),
          );

          const request = yield* HttpClientRequest.post(`${ORLEANS_BASE_URL}/actors/${userId}`).pipe(
            HttpClientRequest.bodyJson(serializedState),
          );

          const httpResponse = yield* httpClient.execute(request).pipe(
            Effect.tapError((error) =>
              Effect.logError('Connection error').pipe(
                Effect.annotateLogs({
                  error: String(error),
                  userId,
                }),
              ),
            ),
            Effect.mapError(
              (error) =>
                new OrleansClientError({
                  message: 'Failed to connect to Orleans sidecar',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`Response status: ${httpResponse.status}`);

          // Check for success status codes
          if (httpResponse.status !== 200 && httpResponse.status !== 201) {
            yield* Effect.logError(`Failed to persist: HTTP ${httpResponse.status}`).pipe(
              Effect.annotateLogs({ userId }),
            );

            return yield* Effect.fail(
              new OrleansClientError({
                message: `Failed to persist actor to Orleans: HTTP ${httpResponse.status}`,
                cause: httpResponse,
              }),
            );
          }

          yield* Effect.logInfo(`✅ Actor state persisted to Orleans`).pipe(Effect.annotateLogs({ userId }));
        }),
    };
  }),
  accessors: true,
}) {}
