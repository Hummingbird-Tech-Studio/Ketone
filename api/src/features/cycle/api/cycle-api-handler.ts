import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { CycleOrleansService } from '../services/cycle-orleans.service';
import { CycleApi } from './cycle-api';
import { CycleActorErrorSchema, CycleRepositoryErrorSchema, OrleansClientErrorSchema } from './schemas';

// ============================================================================
// API Handler. This is the implementation of the API contract
// ============================================================================

export const CycleApiLive = HttpApiBuilder.group(CycleApi, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const orleansService = yield* CycleOrleansService;

    return handlers
      .handle('createCycleOrleans', ({ path, payload }) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[Handler] POST /cycle/orleans/${path.id} - Request received`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to create cycle`);

          // Use Orleans service to orchestrate cycle creation
          const actorState = yield* orleansService.createCycleWithOrleans(path.id, startDate, endDate).pipe(
            Effect.catchTags({
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

          // Extract value and context from persisted snapshot
          const snapshot = actorState as any;

          const response = {
            actorId: path.id,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate ? new Date(snapshot.context.startDate) : null,
              endDate: snapshot.context.endDate ? new Date(snapshot.context.endDate) : null,
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      )
      .handle('getCycleStateOrleans', ({ path }) =>
        Effect.gen(function* () {
          // Use Orleans service to get cycle state
          const actorState = yield* orleansService.getCycleStateFromOrleans(path.id).pipe(
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

          const snapshot = actorState as any;

          return {
            actorId: path.id,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate ? new Date(snapshot.context.startDate) : null,
              endDate: snapshot.context.endDate ? new Date(snapshot.context.endDate) : null,
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

          const snapshot = actorState as any;

          const response = {
            actorId: path.id,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: snapshot.context.startDate ? new Date(snapshot.context.startDate) : null,
              endDate: snapshot.context.endDate ? new Date(snapshot.context.endDate) : null,
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      );
  }),
);
