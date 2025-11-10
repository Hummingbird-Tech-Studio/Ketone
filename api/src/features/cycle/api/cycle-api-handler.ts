import { HttpApiBuilder, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect, Stream } from 'effect';
import { Api } from '../../../api';
import { CycleService } from '../services';
import {
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleNotFoundErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
  CycleOverlapErrorSchema,
  CycleKVStoreErrorSchema,
} from './schemas';
import { CurrentUser, authenticateWebSocket } from '../../auth/api/middleware';

export const CycleApiLive = HttpApiBuilder.group(Api, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;

    return handlers
      .handle('getCycle', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(`[Handler] GET /api/v1/cycles/${cycleId} - Request received for user ${userId}`);

          const cycle = yield* cycleService.getCycle(userId, cycleId).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error getting cycle: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
                  }),
                ),
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle retrieved successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('getCycleInProgress', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] GET /api/v1/cycles/in-progress - Request received for user ${userId}`);

          const cycle = yield* cycleService.getCycleInProgress(userId).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error getting cycle in progress: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
                  }),
                ),
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Active cycle retrieved successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('createCycle', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] POST /api/v1/cycles - Request received for user ${userId}`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling cycle service to create cycle`);

          const cycle = yield* cycleService.createCycle(userId, startDate, endDate).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error creating cycle: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
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
              CycleOverlapError: (error) =>
                Effect.fail(
                  new CycleOverlapErrorSchema({
                    message: error.message,
                    newStartDate: error.newStartDate,
                    lastCompletedEndDate: error.lastCompletedEndDate,
                  }),
                ),
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle created successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('updateCycleDates', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(`[Handler] PATCH /api/v1/cycles/${cycleId} - Request received for user ${userId}`);
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling cycle service to update cycle dates`);

          const cycle = yield* cycleService.updateCycleDates(userId, cycleId, startDate, endDate).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error updating cycle dates: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
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
              CycleOverlapError: (error) =>
                Effect.fail(
                  new CycleOverlapErrorSchema({
                    message: error.message,
                    newStartDate: error.newStartDate,
                    lastCompletedEndDate: error.lastCompletedEndDate,
                  }),
                ),
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle dates updated successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('updateCompletedCycleDates', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `[Handler] PATCH /api/v1/cycles/${cycleId}/completed - Request received for user ${userId}`,
          );
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling cycle service to update completed cycle dates`);

          const cycle = yield* cycleService.updateCompletedCycleDates(userId, cycleId, startDate, endDate).pipe(
            Effect.tapError((error) =>
              Effect.logError(`[Handler] Error updating completed cycle dates: ${error.message}`),
            ),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
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
            }),
          );

          yield* Effect.logInfo(`[Handler] Completed cycle dates updated successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('completeCycle', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `[Handler] POST /api/v1/cycles/${cycleId}/complete - Request received for user ${userId}`,
          );
          yield* Effect.logInfo(`[Handler] Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;

          yield* Effect.logInfo(`[Handler] Calling cycle service to complete cycle`);

          const cycle = yield* cycleService.completeCycle(userId, cycleId, startDate, endDate).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error completing cycle: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
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
              CycleOverlapError: (error) =>
                Effect.fail(
                  new CycleOverlapErrorSchema({
                    message: error.message,
                    newStartDate: error.newStartDate,
                    lastCompletedEndDate: error.lastCompletedEndDate,
                  }),
                ),
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle completed successfully:`, cycle);

          return cycle;
        }),
      )
      .handle('validateCycleOverlap', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `[Handler] POST /api/v1/cycles/${cycleId}/validate-overlap - Request received for user ${userId}`,
          );

          yield* Effect.logInfo(`[Handler] Calling cycle service to validate cycle overlap`);

          const validationResult = yield* cycleService.validateCycleOverlap(userId, cycleId).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error validating cycle overlap: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
              CycleNotFoundError: (error) =>
                Effect.fail(
                  new CycleNotFoundErrorSchema({
                    message: error.message,
                    userId: userId,
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
              CycleKVStoreError: (error) =>
                Effect.fail(
                  new CycleKVStoreErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle overlap validation completed:`, validationResult);

          return validationResult;
        }),
      )
      .handle('getValidationStream', () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const authenticatedUser = yield* authenticateWebSocket(request);
          const userId = authenticatedUser.userId;

          yield* Effect.logInfo(
            `[Handler] GET /api/v1/cycles/validation-stream - WebSocket upgrade requested for user ${userId}`,
          );

          // Upgrade HTTP request to WebSocket
          const socket = yield* request.upgrade.pipe(
            Effect.mapError((error) =>
              new CycleRepositoryErrorSchema({
                message: 'Failed to upgrade to WebSocket',
                cause: error,
              }),
            ),
          );

          yield* Effect.logInfo(`[Handler] WebSocket connection established for user ${userId}`);

          const validationStream = yield* cycleService.getValidationStream(userId).pipe(
            Effect.tapError((error) =>
              Effect.logError(`[Handler] Error getting validation stream: ${error.message}`),
            ),
            Effect.catchAll((error) =>
              Effect.fail(
                new CycleRepositoryErrorSchema({
                  message: 'Failed to get validation stream',
                  cause: error,
                }),
              ),
            ),
          );

          yield* Effect.scoped(
            Effect.gen(function* () {
              const write = yield* socket.writer;

              yield* Stream.runForEach(validationStream, (data) => write(data)).pipe(
                Effect.onExit((exit) =>
                  Effect.logInfo(`[Handler] WebSocket connection closed for user ${userId}: ${exit._tag}`),
                ),
              );
            }),
          ).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(`[Handler] WebSocket error: ${error}`);
                yield* Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: 'WebSocket connection error',
                    cause: error,
                  }),
                );
              }),
            ),
          );

          return HttpServerResponse.empty();
        }),
      );
  }),
);
