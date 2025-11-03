import { Effect, Layer, Option } from 'effect';
import { type CycleRecord, CycleRepository, CycleRepositoryError } from '../repositories';
import {
  CycleAlreadyInProgressError,
  CycleIdMismatchError,
  CycleInvalidStateError,
  CycleNotFoundError,
  CycleOverlapError,
} from '../domain';
import { DatabaseLive } from '../../../db';

export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;

    // Helper function to validate no overlap with last completed cycle
    const validateNoOverlapWithLastCompleted = (
      userId: string,
      newStartDate: Date,
    ): Effect.Effect<void, CycleOverlapError | CycleRepositoryError> =>
      Effect.gen(function* () {
        const lastCompletedOption = yield* repository.getLastCompletedCycle(userId);

        if (Option.isSome(lastCompletedOption)) {
          const lastCompleted = lastCompletedOption.value;

          // Verify that the new start date is greater than or equal to the last completed end date
          if (newStartDate < lastCompleted.endDate) {
            return yield* Effect.fail(
              new CycleOverlapError({
                message: 'Cycle overlaps with the last completed cycle',
                newStartDate,
                lastCompletedEndDate: lastCompleted.endDate,
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

          // Validate that the new cycle doesn't overlap with the last completed cycle
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
        | CycleNotFoundError
        | CycleIdMismatchError
        | CycleInvalidStateError
        | CycleOverlapError
        | CycleRepositoryError
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

          // Validate that the updated dates don't overlap with the last completed cycle
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
          // Use getCycleById instead of getActiveCycle to support idempotency
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

          // Idempotency check: if already completed, return it
          if (cycle.status === 'Completed') {
            return cycle;
          }

          // Verify status is InProgress before completing
          if (cycle.status !== 'InProgress') {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot complete a cycle that is not in progress',
                currentState: cycle.status,
                expectedState: 'InProgress',
              }),
            );
          }

          // Validate that the cycle being completed doesn't overlap with the last completed cycle
          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          return yield* repository.completeCycle(userId, cycleId, startDate, endDate);
        }),
    };
  }),
  dependencies: [CycleRepository.Default],
  accessors: true,
}) {}

export const CycleServiceLive = CycleService.Default.pipe(Layer.provide(DatabaseLive));
