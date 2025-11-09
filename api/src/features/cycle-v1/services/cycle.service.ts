import { Effect, Option, Stream } from 'effect';
import { type CycleRecord, CycleRepository, CycleRepositoryError } from '../repositories';
import {
  CycleAlreadyInProgressError,
  CycleIdMismatchError,
  CycleInvalidStateError,
  CycleNotFoundError,
  CycleOverlapError,
} from '../domain';
import { CycleCompletionCache, CycleCompletionCacheError } from './cycle-completion-cache.service';
import { CycleKVStore, CycleKVStoreError } from './cycle-kv-store.service';

export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const cycleCompletionCache = yield* CycleCompletionCache;
    const cycleKVStore = yield* CycleKVStore;

    /**
     * Get and validate that an active cycle exists for the user
     */
    const getActiveCycle = (userId: string): Effect.Effect<CycleRecord, CycleNotFoundError | CycleKVStoreError> =>
      Effect.gen(function* () {
        const activeCycleOption = yield* cycleKVStore.getInProgressCycle(userId);

        if (Option.isNone(activeCycleOption)) {
          return yield* Effect.fail(
            new CycleNotFoundError({
              message: 'No active cycle found for user',
              userId,
            }),
          );
        }

        return activeCycleOption.value;
      });

    /**
     * Get active cycle and validate that it matches the provided cycleId
     */
    const getAndValidateActiveCycle = (
      userId: string,
      cycleId: string,
    ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleIdMismatchError | CycleKVStoreError> =>
      Effect.gen(function* () {
        const cycle = yield* getActiveCycle(userId);

        if (cycle.id !== cycleId) {
          return yield* Effect.fail(
            new CycleIdMismatchError({
              message: 'Requested cycle ID does not match active cycle',
              requestedCycleId: cycleId,
              activeCycleId: cycle.id,
            }),
          );
        }

        return cycle;
      });

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
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError | CycleKVStoreError> =>
        Effect.gen(function* () {
          const kvCycleOption = yield* cycleKVStore.getInProgressCycle(userId);

          if (Option.isSome(kvCycleOption) && kvCycleOption.value.id === cycleId) {
            yield* Effect.logDebug(`[CycleService] Found cycle ${cycleId} in KeyValueStore (InProgress)`);
            return kvCycleOption.value;
          }

          // If not in KV, check PostgreSQL (for Completed cycles)
          const dbCycleOption = yield* repository.getCycleById(userId, cycleId);

          if (Option.isNone(dbCycleOption)) {
            yield* Effect.logDebug(`[CycleService] Cycle ${cycleId} not found in either KV or DB`);
            return yield* Effect.fail(
              new CycleNotFoundError({
                message: 'Cycle not found',
                userId,
              }),
            );
          }

          yield* Effect.logDebug(`[CycleService] Found cycle ${cycleId} in PostgreSQL (Completed)`);
          return dbCycleOption.value;
        }),

      getCycleInProgress: (
        userId: string,
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError | CycleKVStoreError> =>
        getActiveCycle(userId),

      validateCycleOverlap: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<
        { valid: boolean; overlap: boolean; lastCompletedEndDate?: Date },
        CycleNotFoundError | CycleIdMismatchError | CycleRepositoryError | CycleKVStoreError
      > =>
        Effect.gen(function* () {
          const cycle = yield* getAndValidateActiveCycle(userId, cycleId);

          return yield* validateNoOverlapWithLastCompleted(userId, cycle.startDate).pipe(
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
      ): Effect.Effect<
        CycleRecord,
        CycleAlreadyInProgressError | CycleOverlapError | CycleRepositoryError | CycleKVStoreError
      > =>
        Effect.gen(function* () {
          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          const newCycle = yield* repository.createCycle({
            userId,
            status: 'InProgress',
            startDate,
            endDate,
          });

          yield* cycleKVStore.setInProgressCycle(userId, newCycle).pipe(
            Effect.catchAll((kvError) =>
              Effect.gen(function* () {
                // Rollback: Delete the cycle from PostgreSQL since KVStore failed
                yield* Effect.logError(
                  `[CycleService] Failed to store cycle ${newCycle.id} in KeyValueStore, rolling back Postgres INSERT`,
                );

                yield* repository
                  .deleteCycle(userId, newCycle.id)
                  .pipe(
                    Effect.catchAll((deleteError) =>
                      Effect.logError(
                        `[CycleService] CRITICAL: Failed to rollback cycle ${newCycle.id} from Postgres after KVStore failure: ${JSON.stringify(deleteError)}`,
                      ),
                    ),
                  );

                return yield* Effect.fail(kvError);
              }),
            ),
          );

          return newCycle;
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
        | CycleKVStoreError
      > =>
        Effect.gen(function* () {
          const cycle = yield* getAndValidateActiveCycle(userId, cycleId);

          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          const updatedCycle: CycleRecord = {
            ...cycle,
            startDate,
            endDate,
            updatedAt: new Date(),
          };

          yield* cycleKVStore.setInProgressCycle(userId, updatedCycle);

          return updatedCycle;
        }),

      completeCycle: (
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
        | CycleKVStoreError
      > =>
        Effect.gen(function* () {
          const cycle = yield* getAndValidateActiveCycle(userId, cycleId);

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

          // Update cycle in PostgreSQL to Completed status
          const completedCycle = yield* repository.completeCycle(userId, cycleId, startDate, endDate);

          // Remove from KeyValueStore
          yield* cycleKVStore.removeInProgressCycle(userId);

          // Update completion cache
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

      updateCompletedCycleDates: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleInvalidStateError | CycleRepositoryError> =>
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

          if (cycle.status !== 'Completed') {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot update dates of a cycle that is not completed',
                currentState: cycle.status,
                expectedState: 'Completed',
              }),
            );
          }

          const updatedCycle = yield* repository.updateCompletedCycleDates(userId, cycleId, startDate, endDate);

          // Check if this was the last completed cycle - if so, update the cache
          const lastCompletedOption = yield* repository.getLastCompletedCycle(userId);

          if (Option.isSome(lastCompletedOption) && lastCompletedOption.value.id === cycleId) {
            yield* Effect.logInfo(
              `[CycleService] Updated cycle ${cycleId} is the last completed cycle, updating cache`,
            );

            yield* cycleCompletionCache.setLastCompletionDate(userId, updatedCycle.endDate).pipe(
              Effect.tapError((error) =>
                Effect.logWarning(
                  `[CycleService] Failed to update completion cache for user ${userId}: ${JSON.stringify(error)}`,
                ),
              ),
              Effect.catchAll(() => Effect.void),
            );
          } else {
            yield* Effect.logInfo(
              `[CycleService] Updated cycle ${cycleId} is not the last completed cycle, no cache update needed`,
            );
          }

          return updatedCycle;
        }),

      /**
       * Get a stream of validation updates for a user
       * Returns a stream of JSON strings containing the last completion date
       * The stream emits the current value first, then all future changes
       */
      getValidationStream: (userId: string): Effect.Effect<Stream.Stream<string>, CycleCompletionCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[CycleService] Creating validation stream for user ${userId}`);

          const changeStream = yield* cycleCompletionCache.subscribeToChanges(userId);

          return Stream.map(changeStream, (lastCompletionDateOption) =>
            Option.match(lastCompletionDateOption, {
              onNone: () => JSON.stringify({ lastCompletionDate: null }),
              onSome: (date) => JSON.stringify({ lastCompletionDate: date.toISOString() }),
            }),
          );
        }),
    };
  }),
  dependencies: [CycleRepository.Default, CycleCompletionCache.Default, CycleKVStore.Default],
  accessors: true,
}) {}
