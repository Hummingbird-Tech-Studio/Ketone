import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { CycleService } from '../services';
import {
  CycleRepositoryErrorSchema,
  CycleAlreadyInProgressErrorSchema,
  CycleNotFoundErrorSchema,
  CycleIdMismatchErrorSchema,
  CycleInvalidStateErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

export const CycleApiLive = HttpApiBuilder.group(Api, 'cycle-v1', (handlers) =>
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
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle retrieved successfully:`, cycle);

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
            }),
          );

          yield* Effect.logInfo(`[Handler] Cycle dates updated successfully:`, cycle);

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

          yield* Effect.logInfo(`[Handler] Cycle completed successfully:`, cycle);

          return cycle;
        }),
      );
  }),
);
