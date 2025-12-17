import { HttpApiBuilder, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { Effect, Stream } from 'effect';
import { Api } from '../../../api';
import { CycleService, CycleRefCacheError } from '../services';
import {
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleNotFoundErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
  CycleOverlapErrorSchema,
  CycleRefCacheErrorSchema,
} from './schemas';
import { CurrentUser, authenticateWebSocket } from '../../auth/api/middleware';
import { CycleNotFoundError, CycleIdMismatchError, CycleInvalidStateError, CycleOverlapError } from '../domain';
import { CycleRepositoryError } from '../repositories';

const cycleUpdateErrorHandlers = (userId: string) => ({
  CycleRepositoryError: (error: CycleRepositoryError) =>
    Effect.fail(
      new CycleRepositoryErrorSchema({
        message: error.message,
        cause: error.cause,
      }),
    ),
  CycleNotFoundError: (error: CycleNotFoundError) =>
    Effect.fail(
      new CycleNotFoundErrorSchema({
        message: error.message,
        userId: userId,
      }),
    ),
  CycleIdMismatchError: (error: CycleIdMismatchError) =>
    Effect.fail(
      new CycleIdMismatchErrorSchema({
        message: error.message,
        requestedCycleId: error.requestedCycleId,
        activeCycleId: error.activeCycleId,
      }),
    ),
  CycleInvalidStateError: (error: CycleInvalidStateError) =>
    Effect.fail(
      new CycleInvalidStateErrorSchema({
        message: error.message,
        currentState: error.currentState,
        expectedState: error.expectedState,
      }),
    ),
  CycleOverlapError: (error: CycleOverlapError) =>
    Effect.fail(
      new CycleOverlapErrorSchema({
        message: error.message,
        newStartDate: error.newStartDate,
        lastCompletedEndDate: error.lastCompletedEndDate,
      }),
    ),
  CycleRefCacheError: (error: CycleRefCacheError) =>
    Effect.fail(
      new CycleRefCacheErrorSchema({
        message: error.message,
        cause: error.cause,
      }),
    ),
});

export const CycleApiLive = HttpApiBuilder.group(Api, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;

    return handlers
      .handle('getCycle', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(`GET /api/v1/cycles/${cycleId} - Request received for user ${userId}`);

          const cycle = yield* cycleService.getCycle(userId, cycleId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting cycle: ${error.message}`)),
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
              CycleRefCacheError: (error) =>
                Effect.fail(
                  new CycleRefCacheErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Cycle retrieved successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.getCycle' })),
      )
      .handle('getCycleInProgress', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`GET /api/v1/cycles/in-progress - Request received for user ${userId}`);

          const cycle = yield* cycleService.getCycleInProgress(userId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting cycle in progress: ${error.message}`)),
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
              CycleRefCacheError: (error) =>
                Effect.fail(
                  new CycleRefCacheErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Active cycle retrieved successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.getCycleInProgress' })),
      )
      .handle('createCycle', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`POST /api/v1/cycles - Request received for user ${userId}`);
          yield* Effect.logInfo(`Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;
          const notes = payload.notes;

          yield* Effect.logInfo(`Calling cycle service to create cycle`);

          const cycle = yield* cycleService.createCycle(userId, startDate, endDate, notes).pipe(
            Effect.tapError((error) => Effect.logError(`Error creating cycle: ${error.message}`)),
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
              CycleRefCacheError: (error) =>
                Effect.fail(
                  new CycleRefCacheErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Cycle created successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.createCycle' })),
      )
      .handle('updateCycleDates', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(`PATCH /api/v1/cycles/${cycleId} - Request received for user ${userId}`);
          yield* Effect.logInfo(`Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;
          const notes = payload.notes;

          yield* Effect.logInfo(`Calling cycle service to update cycle dates`);

          const cycle = yield* cycleService.updateCycleDates(userId, cycleId, startDate, endDate, notes).pipe(
            Effect.tapError((error) => Effect.logError(`Error updating cycle dates: ${error.message}`)),
            Effect.catchTags(cycleUpdateErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Cycle dates updated successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.updateCycleDates' })),
      )
      .handle('updateCompletedCycleDates', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `PATCH /api/v1/cycles/${cycleId}/completed - Request received for user ${userId}`,
          );
          yield* Effect.logInfo(`Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;
          const notes = payload.notes;

          yield* Effect.logInfo(`Calling cycle service to update completed cycle dates`);

          const cycle = yield* cycleService.updateCompletedCycleDates(userId, cycleId, startDate, endDate, notes).pipe(
            Effect.tapError((error) =>
              Effect.logError(`Error updating completed cycle dates: ${error.message}`),
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

          yield* Effect.logInfo(`Completed cycle dates updated successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.updateCompletedCycleDates' })),
      )
      .handle('completeCycle', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `POST /api/v1/cycles/${cycleId}/complete - Request received for user ${userId}`,
          );
          yield* Effect.logInfo(`Payload:`, payload);

          const startDate = payload.startDate;
          const endDate = payload.endDate;
          const notes = payload.notes;

          yield* Effect.logInfo(`Calling cycle service to complete cycle`);

          const cycle = yield* cycleService.completeCycle(userId, cycleId, startDate, endDate, notes).pipe(
            Effect.tapError((error) => Effect.logError(`Error completing cycle: ${error.message}`)),
            Effect.catchTags(cycleUpdateErrorHandlers(userId)),
          );

          yield* Effect.logInfo(`Cycle completed successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.completeCycle' })),
      )
      .handle('updateCycleNotes', ({ payload, path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `PATCH /api/v1/cycles/${cycleId}/notes - Request received for user ${userId}`,
          );
          yield* Effect.logInfo(`Payload:`, payload);

          const notes = payload.notes;

          yield* Effect.logInfo(`Calling cycle service to update cycle notes`);

          const cycle = yield* cycleService.updateCycleNotes(userId, cycleId, notes).pipe(
            Effect.tapError((error) => Effect.logError(`Error updating cycle notes: ${error.message}`)),
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
              CycleRefCacheError: (error) =>
                Effect.fail(
                  new CycleRefCacheErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Cycle notes updated successfully:`, cycle);

          return cycle;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.updateCycleNotes' })),
      )
      .handle('validateCycleOverlap', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(
            `POST /api/v1/cycles/${cycleId}/validate-overlap - Request received for user ${userId}`,
          );

          yield* Effect.logInfo(`Calling cycle service to validate cycle overlap`);

          const validationResult = yield* cycleService.validateCycleOverlap(userId, cycleId).pipe(
            Effect.tapError((error) => Effect.logError(`Error validating cycle overlap: ${error.message}`)),
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
              CycleRefCacheError: (error) =>
                Effect.fail(
                  new CycleRefCacheErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Cycle overlap validation completed:`, validationResult);

          return validationResult;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.validateCycleOverlap' })),
      )
      .handle('getValidationStream', () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const authenticatedUser = yield* authenticateWebSocket(request);
          const userId = authenticatedUser.userId;

          yield* Effect.logInfo(
            `GET /api/v1/cycles/validation-stream - WebSocket upgrade requested for user ${userId}`,
          );

          // Upgrade HTTP request to WebSocket
          const socket = yield* request.upgrade.pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryErrorSchema({
                  message: 'Failed to upgrade to WebSocket',
                  cause: error,
                }),
            ),
          );

          yield* Effect.logInfo(`WebSocket connection established for user ${userId}`);

          const validationStream = yield* cycleService.getValidationStream(userId).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting validation stream: ${error.message}`)),
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
                  Effect.logInfo(`WebSocket connection closed for user ${userId}: ${exit._tag}`),
                ),
              );
            }),
          ).pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError(`WebSocket error: ${error}`);
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
        }).pipe(Effect.annotateLogs({ handler: 'cycle.getValidationStream' })),
      )
      .handle('getCycleStatistics', ({ urlParams }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const { period, date } = urlParams;

          yield* Effect.logInfo(`GET /api/v1/cycles/statistics - Request received for user ${userId}`);
          yield* Effect.logInfo(`Query params: period=${period}, date=${date}`);

          const statistics = yield* cycleService.getCycleStatistics(userId, period, date).pipe(
            Effect.tapError((error) => Effect.logError(`Error getting cycle statistics: ${error.message}`)),
            Effect.catchTags({
              CycleRepositoryError: (error) =>
                Effect.fail(
                  new CycleRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`Cycle statistics retrieved successfully:`, statistics);

          return statistics;
        }).pipe(Effect.annotateLogs({ handler: 'cycle.getCycleStatistics' })),
      )
      .handle('deleteCycle', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;
          const cycleId = path.id;

          yield* Effect.logInfo(`DELETE /api/v1/cycles/${cycleId} - Request received for user ${userId}`);

          yield* cycleService.deleteCycle(userId, cycleId).pipe(
            Effect.tapError((error) => Effect.logError(`Error deleting cycle: ${error.message}`)),
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

          yield* Effect.logInfo(`Cycle ${cycleId} deleted successfully`);
        }).pipe(Effect.annotateLogs({ handler: 'cycle.deleteCycle' })),
      );
  }),
);
