import { Effect, Layer, Option } from 'effect';
import { type CycleRecord, CycleRepository, CycleRepositoryError } from '../repositories';
import {
  CycleAlreadyInProgressError,
  CycleIdMismatchError,
  CycleInvalidStateError,
  CycleNotFoundError,
  CycleOverlapError,
} from '../domain';
import { CycleCompletionCache, CycleCompletionCacheLive } from './cycle-completion-cache.service';

export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const cycleCompletionCache = yield* CycleCompletionCache;

    const validateNoOverlapWithLastCompleted = (
      userId: string,
      newStartDate: Date,
    ): Effect.Effect<void, CycleOverlapError | CycleRepositoryError> =>
      Effect.gen(function* () {
        const lastCompletedDateOption = yield* cycleCompletionCache.getLastCompletionDate(userId).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                `[CycleService] Cache lookup failed for user ${userId}, falling back to direct DB query: ${error.message}`,
              );

              const lastCompletedCycleOption = yield* repository.getLastCompletedCycle(userId);

              if (Option.isNone(lastCompletedCycleOption)) {
                return Option.none<Date>();
              }

              return Option.some(lastCompletedCycleOption.value.endDate);
            }),
          ),
        );

        if (Option.isSome(lastCompletedDateOption)) {
          const lastCompletedEndDate = lastCompletedDateOption.value;

          if (newStartDate < lastCompletedEndDate) {
            return yield* Effect.fail(
              new CycleOverlapError({
                message: 'Cycle overlaps with the last completed cycle',
                newStartDate,
                lastCompletedEndDate,
              }),
            );
          }
        }
      });

    return {
      getCycle: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError> =>
        Effect.gen(function* () {
          const cycleOption = yield* repository.getCycleById(userId, cycleId);

          if (Option.isNone(cycleOption)) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'Cycle not found',
                userId,
              }),
            );
          }

          return cycleOption.value;
        }),

      getCycleInProgress: (userId: string): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError> =>
        Effect.gen(function* () {
          const activeCycleOption = yield* repository.getActiveCycle(userId);

          if (Option.isNone(activeCycleOption)) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'No active cycle found for user',
                userId,
              }),
            );
          }

          return activeCycleOption.value;
        }),

      validateCycleOverlap: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<
        { valid: boolean; overlap: boolean; lastCompletedEndDate?: Date },
        CycleNotFoundError | CycleIdMismatchError | CycleRepositoryError
      > =>
        Effect.gen(function* () {
          const activeCycleOption = yield* repository.getActiveCycle(userId);

          if (Option.isNone(activeCycleOption)) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'No active cycle found for user',
                userId,
              }),
            );
          }

          const cycle = activeCycleOption.value;

          if (cycle.id !== cycleId) {
            return yield* Effect.fail(
              new CycleIdMismatchError({
                message: 'Requested cycle ID does not match active cycle',
                requestedCycleId: cycleId,
                activeCycleId: cycle.id,
              }),
            );
          }

          return yield * validateNoOverlapWithLastCompleted(userId, cycle.startDate).pipe(
            Effect.map(() => ({ valid: true, overlap: false })),
            Effect.catchTag('CycleOverlapError', (error) =>
              Effect.succeed({
                valid: false,
                overlap: true,
                lastCompletedEndDate: error.lastCompletedEndDate,
              }),
            ),
          );
        }),

      createCycle: (
        userId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<CycleRecord, CycleAlreadyInProgressError | CycleOverlapError | CycleRepositoryError> =>
        Effect.gen(function* () {
          const activeCycle = yield* repository.getActiveCycle(userId);

          if (Option.isSome(activeCycle)) {
            return yield* Effect.fail(
              new CycleAlreadyInProgressError({
                message: 'User already has a cycle in progress',
                userId,
              }),
            );
          }

          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          return yield* repository.createCycle({
            userId,
            status: 'InProgress',
            startDate,
            endDate,
          });
        }),

      updateCycleDates: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<
        CycleRecord,
        CycleNotFoundError | CycleIdMismatchError | CycleInvalidStateError | CycleOverlapError | CycleRepositoryError
      > =>
        Effect.gen(function* () {
          const activeCycle = yield* repository.getActiveCycle(userId);

          if (Option.isNone(activeCycle)) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'No active cycle found for user',
                userId,
              }),
            );
          }

          const cycle = activeCycle.value;

          if (cycle.id !== cycleId) {
            return yield* Effect.fail(
              new CycleIdMismatchError({
                message: 'Requested cycle ID does not match active cycle',
                requestedCycleId: cycleId,
                activeCycleId: cycle.id,
              }),
            );
          }

          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          return yield* repository.updateCycleDates(userId, cycleId, startDate, endDate);
        }),

      completeCycle: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<
        CycleRecord,
        CycleNotFoundError | CycleInvalidStateError | CycleOverlapError | CycleRepositoryError
      > =>
        Effect.gen(function* () {
          const cycleOption = yield* repository.getCycleById(userId, cycleId);

          if (Option.isNone(cycleOption)) {
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'Cycle not found',
                userId,
              }),
            );
          }

          const cycle = cycleOption.value;

          if (cycle.status === 'Completed') {
            return cycle;
          }

          if (cycle.status !== 'InProgress') {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot complete a cycle that is not in progress',
                currentState: cycle.status,
                expectedState: 'InProgress',
              }),
            );
          }

          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          const completedCycle = yield* repository.completeCycle(userId, cycleId, startDate, endDate);

          yield* cycleCompletionCache.setLastCompletionDate(userId, completedCycle.endDate).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(
                `[CycleService] Failed to update completion cache for user ${userId}: ${JSON.stringify(error)}`,
              ),
            ),
            Effect.catchAll(() => Effect.void),
          );

          return completedCycle;
        }),
    };
  }),
  dependencies: [CycleCompletionCache.Default],
  accessors: true,
}) {}

export const CycleServiceLive = CycleService.Default.pipe(Layer.provide(CycleCompletionCacheLive));
