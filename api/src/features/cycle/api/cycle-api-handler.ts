import { HttpApiBuilder } from '@effect/platform';
import { Effect, Schema as S } from 'effect';
import { CurrentUser } from '../../auth/api/middleware';
import { LocalActorStateSchema, OrleansActorStateSchema } from '../infrastructure/orleans-client';
import { CycleOrleansService } from '../services/cycle-orleans.service';
import { CycleApi } from './cycle-api';
import {
  CycleActorErrorSchema,
  CycleInProgressErrorSchema,
  CycleRepositoryErrorSchema,
  OrleansClientErrorSchema,
} from './schemas';

// ============================================================================
// API Handler. This is the implementation of the API contract
// ============================================================================

export const CycleApiLive = HttpApiBuilder.group(CycleApi, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const orleansService = yield* CycleOrleansService;

    return handlers
      .handle('createCycleOrleans', ({ payload }) =>
        Effect.gen(function* () {
          // Access authenticated user (grain ID = user ID)
          const currentUser = yield* CurrentUser;
          const grainId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] POST /cycle/orleans - Request received`);
          yield* Effect.logInfo(`[Handler] User: ${currentUser.email} (ID: ${grainId})`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to create cycle for grain ${grainId}`);

          // Use Orleans service to orchestrate cycle creation (grain ID = user ID)
          const actorState = yield* orleansService.createCycleWithOrleans(grainId, startDate, endDate).pipe(
            Effect.catchTags({
              CycleInProgressError: () =>
                Effect.fail(
                  new CycleInProgressErrorSchema({
                    message: 'A cycle is already in progress',
                  }),
                ),
              CycleActorError: (error) =>
                Effect.fail(
                  new CycleActorErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              OrleansClientError: (error) =>
                Effect.fail(
                  new OrleansClientErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle created successfully, preparing response`);
          yield* Effect.logInfo(`[Handler] Persisted snapshot:`, actorState);

          // Decode and validate actor state from local machine (has Date objects, not ISO strings)
          const snapshot = yield* S.decodeUnknown(LocalActorStateSchema)(actorState).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] ❌ Failed to decode snapshot`, error)),
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          const response = {
            actorId: grainId,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate,
              endDate: snapshot.context.endDate,
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      )
      .handle('getCycleStateOrleans', ({ path }) =>
        Effect.gen(function* () {
          // Get cycle state from Orleans
          const actorState = yield* orleansService.getCycleStateFromOrleans(path.id).pipe(
            Effect.catchTags({
              CycleActorError: (error) =>
                Effect.fail(
                  new CycleActorErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          // Decode and validate actor state
          const snapshot = yield* S.decodeUnknown(OrleansActorStateSchema)(actorState).pipe(
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          // Return transformed response
          return {
            actorId: path.id,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate,
              endDate: snapshot.context.endDate,
            },
          };
        }),
      )
      .handle('updateCycleOrleans', ({ path, payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] PUT /cycle/orleans/${path.id} - Request received`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to update cycle state`);

          // Use Orleans service to update cycle state
          const actorState = yield* orleansService.updateCycleStateInOrleans(path.id, startDate, endDate).pipe(
            Effect.catchTags({
              CycleActorError: (error) =>
                Effect.fail(
                  new CycleActorErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              OrleansClientError: (error) =>
                Effect.fail(
                  new OrleansClientErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle state updated successfully, preparing response`);
          yield* Effect.logInfo(`[Handler] Persisted snapshot:`, actorState);

          // Decode and validate actor state from local machine (has Date objects, not ISO strings)
          const snapshot = yield* S.decodeUnknown(LocalActorStateSchema)(actorState).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] ❌ Failed to decode snapshot`, error)),
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          const response = {
            actorId: path.id,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate,
              endDate: snapshot.context.endDate,
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      );
  }),
);
