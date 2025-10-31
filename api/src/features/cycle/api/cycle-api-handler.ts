import { HttpApiBuilder } from '@effect/platform';
import { Effect, Schema as S } from 'effect';
import { Api } from '../../../api';
import { XStateSnapshotWithDatesSchema, OrleansActorStateSchema } from '../infrastructure/orleans-client';
import { CycleOrleansService } from '../services/cycle-orleans.service';
import { ensureDate } from '../utils/date-helpers';
import {
  CycleActorErrorSchema,
  CycleRepositoryErrorSchema,
  OrleansClientErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

// ============================================================================
// API Handler. This is the implementation of the API contract
// ============================================================================

export const CycleApiLive = HttpApiBuilder.group(Api, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const orleansService = yield* CycleOrleansService;

    return handlers
      .handle('createCycleOrleans', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] POST /cycle/orleans - Request received for user ${userId}`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to create cycle`);

          const actorState = yield* orleansService.createCycleWithOrleans(userId, startDate, endDate).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error creating cycle: ${error.message}`)),
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
              CycleAlreadyInProgressError: (error) =>
                Effect.fail(
                  new CycleAlreadyInProgressErrorSchema({
                    message: error.message,
                    userId: userId,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle created successfully, preparing response`);
          yield* Effect.logInfo(`[Handler] Persisted snapshot:`, actorState);

          const snapshot = yield* S.decodeUnknown(XStateSnapshotWithDatesSchema)(actorState).pipe(
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode XState snapshot from service',
                  cause: error,
                }),
            ),
          );

          const response = {
            userId: userId,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: ensureDate(snapshot.context.startDate),
              endDate: ensureDate(snapshot.context.endDate),
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      )
      .handle('getCycleStateOrleans', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] GET /cycle - Request received for user ${userId}`);

          const actorState = yield* orleansService.getCycleStateFromOrleans(userId).pipe(
            Effect.catchTag('CycleActorError', (error) =>
              Effect.fail(
                new CycleActorErrorSchema({
                  message: error.message,
                  cause: error.cause,
                }),
              ),
            ),
          );

          const snapshot = yield* S.decodeUnknown(OrleansActorStateSchema)(actorState).pipe(
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          return {
            userId: userId,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: ensureDate(snapshot.context.startDate),
              endDate: ensureDate(snapshot.context.endDate),
            },
          };
        }),
      )
      .handle('updateCycleDates', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] PATCH /cycle - Request received for user ${userId}`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const cycleId = payload.cycleId;
          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to update cycle dates ${cycleId}`);

          const actorState = yield* orleansService.updateCycleDatesInOrleans(userId, cycleId, startDate, endDate).pipe(
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
              CycleIdMismatchError: (error) =>
                Effect.fail(
                  new CycleIdMismatchErrorSchema({
                    message: error.message,
                    requestedCycleId: error.requestedCycleId,
                    activeCycleId: error.activeCycleId,
                  }),
                ),
              CycleInvalidStateError: (error) =>
                Effect.fail(
                  new CycleInvalidStateErrorSchema({
                    message: error.message,
                    currentState: error.currentState,
                    expectedState: error.expectedState,
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

          yield* Effect.logInfo(`[Handler] Cycle dates updated successfully, preparing response`);
          yield* Effect.logInfo(`[Handler] Persisted snapshot:`, actorState);

          const snapshot = yield* S.decodeUnknown(OrleansActorStateSchema)(actorState).pipe(
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          const response = {
            userId: userId,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: ensureDate(snapshot.context.startDate),
              endDate: ensureDate(snapshot.context.endDate),
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      )
      .handle('updateCycleOrleans', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] POST /cycle/complete - Request received for user ${userId}`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const cycleId = payload.cycleId;
          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling Orleans service to complete cycle ${cycleId}`);

          const actorState = yield* orleansService.updateCycleStateInOrleans(userId, cycleId, startDate, endDate).pipe(
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
              CycleIdMismatchError: (error) =>
                Effect.fail(
                  new CycleIdMismatchErrorSchema({
                    message: error.message,
                    requestedCycleId: error.requestedCycleId,
                    activeCycleId: error.activeCycleId,
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

          yield* Effect.logInfo(`[Handler] Cycle completed successfully, preparing response`);
          yield* Effect.logInfo(`[Handler] Persisted snapshot:`, actorState);

          const snapshot = yield* S.decodeUnknown(OrleansActorStateSchema)(actorState).pipe(
            Effect.mapError(
              (error) =>
                new CycleActorErrorSchema({
                  message: 'Failed to decode actor state',
                  cause: error,
                }),
            ),
          );

          const response = {
            userId: userId,
            state: snapshot.value,
            cycle: {
              id: snapshot.context.id,
              startDate: ensureDate(snapshot.context.startDate),
              endDate: ensureDate(snapshot.context.endDate),
            },
          };

          yield* Effect.logInfo(`[Handler] Returning response:`, response);

          return response;
        }),
      );
  }),
);
