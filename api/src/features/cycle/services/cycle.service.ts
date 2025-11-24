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
import { CycleRefCache, CycleRefCacheError } from './cycle-ref-cache.service';
import { calculatePeriodRange, type PeriodType } from '../utils';

export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const cycleCompletionCache = yield* CycleCompletionCache;
    const cycleRefCache = yield* CycleRefCache;

    /**
     * Get and validate that an active cycle exists for the user
     */
    const getActiveCycle = (
      userId: string,
    ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRefCacheError | CycleRepositoryError> =>
      Effect.gen(function* () {
        // Check RefCache first
        const kvCycleOption = yield* cycleRefCache.getInProgressCycle(userId);

        if (Option.isSome(kvCycleOption)) {
          yield* Effect.logDebug(`[CycleService] Found active cycle in RefCache`);
          return kvCycleOption.value;
        }

        // Fallback: Check PostgreSQL for InProgress cycle
        yield* Effect.logDebug(`[CycleService] Active cycle not in RefCache, checking PostgreSQL`);
        const dbCycleOption = yield* repository.getActiveCycle(userId);

        if (Option.isNone(dbCycleOption)) {
          yield* Effect.logDebug(`[CycleService] No active cycle found in either RefCache or PostgreSQL`);
          return yield* Effect.fail(
            new CycleNotFoundError({
              message: 'No active cycle found for user',
              userId,
            }),
          );
        }

        // Found in DB but not in cache - sync it back to RefCache
        const cycle = dbCycleOption.value;
        yield* Effect.logWarning(
          `[CycleService] Found active cycle ${cycle.id} in PostgreSQL but not in RefCache, re-syncing to RefCache`,
        );

        yield* cycleRefCache.setInProgressCycle(userId, cycle).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(`[CycleService] Failed to sync cycle ${cycle.id} to RefCache: ${error.message}`),
          ),
          Effect.ignore,
        );

        return cycle;
      });

    /**
     * Get active cycle and validate that it matches the provided cycleId
     */
    const getAndValidateActiveCycle = (
      userId: string,
      cycleId: string,
    ): Effect.Effect<
      CycleRecord,
      CycleNotFoundError | CycleIdMismatchError | CycleRefCacheError | CycleRepositoryError
    > =>
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
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError> =>
        Effect.gen(function* () {
          const kvCycleOption = yield* cycleRefCache.getInProgressCycle(userId);

          if (Option.isSome(kvCycleOption) && kvCycleOption.value.id === cycleId) {
            yield* Effect.logDebug(`[CycleService] Found cycle ${cycleId} in RefCache (InProgress)`);
            return kvCycleOption.value;
          }

          // If not in cache, check PostgreSQL (for Completed cycles)
          const dbCycleOption = yield* repository.getCycleById(userId, cycleId);

          if (Option.isNone(dbCycleOption)) {
            yield* Effect.logDebug(`[CycleService] Cycle ${cycleId} not found in either RefCache or DB`);
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
      ): Effect.Effect<CycleRecord, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError> =>
        getActiveCycle(userId),

      validateCycleOverlap: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<
        { valid: boolean; overlap: boolean; lastCompletedEndDate?: Date },
        CycleNotFoundError | CycleIdMismatchError | CycleRepositoryError | CycleRefCacheError
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
        CycleAlreadyInProgressError | CycleOverlapError | CycleRepositoryError | CycleRefCacheError
      > =>
        Effect.gen(function* () {
          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          const newCycle = yield* repository.createCycle({
            userId,
            status: 'InProgress',
            startDate,
            endDate,
          });

          yield* cycleRefCache.setInProgressCycle(userId, newCycle).pipe(
            Effect.catchAll((kvError) =>
              Effect.gen(function* () {
                // Rollback: Delete the cycle from PostgreSQL since RefCache failed
                yield* Effect.logError(
                  `[CycleService] Failed to store cycle ${newCycle.id} in RefCache, rolling back Postgres INSERT`,
                );

                yield* repository
                  .deleteCycle(userId, newCycle.id)
                  .pipe(
                    Effect.catchAll((deleteError) =>
                      Effect.logError(
                        `[CycleService] CRITICAL: Failed to rollback cycle ${newCycle.id} from Postgres after RefCache failure: ${JSON.stringify(deleteError)}`,
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
        | CycleRefCacheError
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

          yield* cycleRefCache.setInProgressCycle(userId, updatedCycle);

          // Persist to PostgreSQL in background (fire and forget)
          yield* repository.updateCycleDates(userId, cycleId, startDate, endDate).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(
                `[CycleService] Failed to persist cycle dates to PostgreSQL: ${error.message}`,
              ),
            ),
            Effect.forkDaemon,
            Effect.ignore,
          );

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
        | CycleRefCacheError
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
          yield* cycleRefCache.removeInProgressCycle(userId);

          // Update completion cache
          yield* cycleCompletionCache.setLastCompletionDate(userId, completedCycle.endDate).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(
                `[CycleService] Failed to update completion cache for user ${userId}: ${JSON.stringify(error)}`,
              ),
            ),
            Effect.ignore,
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
              Effect.ignore,
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

      /**
       * Get cycle statistics for a given period
       * Returns all cycles where startDate falls within the calculated period range
       */
      getCycleStatistics: (
        userId: string,
        periodType: PeriodType,
        date: Date,
      ): Effect.Effect<
        { periodStart: Date; periodEnd: Date; periodType: PeriodType; cycles: CycleRecord[] },
        CycleRepositoryError
      > =>
        Effect.gen(function* () {
          const { start: periodStart, end: periodEnd } = calculatePeriodRange(periodType, date);

          yield* Effect.logInfo(
            `[CycleService] Getting cycle statistics for user ${userId}, period: ${periodType}, range: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
          );

          const cycles = yield* repository.getCyclesByPeriod(userId, periodStart, periodEnd);

          yield* Effect.logInfo(`[CycleService] Found ${cycles.length} cycles in period`);

          return {
            periodStart,
            periodEnd,
            periodType,
            cycles,
          };
        }),
    };
  }),
  dependencies: [CycleRepository.Default, CycleCompletionCache.Default, CycleRefCache.Default],
  accessors: true,
}) {}
