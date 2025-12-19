import { Effect, Option, Stream } from 'effect';
import { type FastingFeeling, type CycleDetailResponse, type CycleStatisticsItem, type PeriodType } from '@ketone/shared';
import { type CycleRecord, CycleRepository, CycleRepositoryError } from '../repositories';
import {
  CycleAlreadyInProgressError,
  CycleIdMismatchError,
  CycleInvalidStateError,
  CycleNotFoundError,
  CycleOverlapError,
  TimezoneConversionError,
  FeelingsLimitExceededError,
} from '../domain';
import { CycleCompletionCache, CycleCompletionCacheError } from './cycle-completion-cache.service';
import { CycleRefCache, CycleRefCacheError } from './cycle-ref-cache.service';
import { calculatePeriodRange } from '../utils';

/**
 * Type for cycle record with feelings attached
 */
type CycleWithFeelings = CycleRecord & { feelings: FastingFeeling[] };

/**
 * Calculate the effective duration of a cycle within a period
 * Returns proportional duration info for cycles that may extend beyond period boundaries
 */
const calculateEffectiveDuration = (
  cycle: CycleRecord,
  periodStart: Date,
  periodEnd: Date,
): {
  effectiveDuration: number;
  isExtended: boolean;
  overflowBefore?: number;
  overflowAfter?: number;
  effectiveEndDate: Date;
} => {
  const cycleStartMs = cycle.startDate.getTime();
  const periodStartMs = periodStart.getTime();
  const periodEndMs = periodEnd.getTime();

  // For InProgress cycles, use current time instead of stored endDate
  // Cap at periodEnd to handle viewing past periods
  const cycleEndMs = cycle.status === 'InProgress' ? Math.min(Date.now(), periodEndMs) : cycle.endDate.getTime();

  // Calculate effective boundaries within the period
  const effectiveStartMs = Math.max(cycleStartMs, periodStartMs);
  const effectiveEndMs = Math.min(cycleEndMs, periodEndMs);
  const effectiveDuration = Math.max(0, effectiveEndMs - effectiveStartMs);

  // Calculate overflow portions
  const overflowBefore = cycleStartMs < periodStartMs ? periodStartMs - cycleStartMs : undefined;
  // For InProgress cycles, use current time; for completed cycles, use stored endDate
  const effectiveOverflowEndMs = cycle.status === 'InProgress' ? Date.now() : cycle.endDate.getTime();
  const overflowAfter = effectiveOverflowEndMs > periodEndMs ? effectiveOverflowEndMs - periodEndMs : undefined;
  const isExtended = overflowBefore !== undefined || overflowAfter !== undefined;

  return { effectiveDuration, isExtended, overflowBefore, overflowAfter, effectiveEndDate: new Date(cycleEndMs) };
};

export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const cycleCompletionCache = yield* CycleCompletionCache;
    const cycleRefCache = yield* CycleRefCache;

    /**
     * Helper to attach feelings to a cycle record
     */
    const attachFeelings = (cycle: CycleRecord): Effect.Effect<CycleWithFeelings, CycleRepositoryError> =>
      Effect.gen(function* () {
        const feelings = yield* repository.getFeelingsByCycleId(cycle.id);
        return { ...cycle, feelings };
      });

    /**
     * Helper to attach feelings to multiple cycle records
     */
    const attachFeelingsToMany = (cycles: CycleRecord[]): Effect.Effect<CycleWithFeelings[], CycleRepositoryError> =>
      Effect.all(cycles.map(attachFeelings));

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
          yield* Effect.logDebug('Found active cycle in RefCache');
          return kvCycleOption.value;
        }

        // Fallback: Check PostgreSQL for InProgress cycle
        yield* Effect.logDebug('Active cycle not in RefCache, checking PostgreSQL');
        const dbCycleOption = yield* repository.getActiveCycle(userId);

        if (Option.isNone(dbCycleOption)) {
          yield* Effect.logDebug('No active cycle found in either RefCache or PostgreSQL');
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
          `Found active cycle ${cycle.id} in PostgreSQL but not in RefCache, re-syncing to RefCache`,
        );

        yield* cycleRefCache.setInProgressCycle(userId, cycle).pipe(
          Effect.tapError((error) =>
            Effect.logWarning(`Failed to sync cycle ${cycle.id} to RefCache: ${error.message}`),
          ),
          Effect.ignore,
        );

        return cycle;
      }).pipe(Effect.annotateLogs({ service: 'CycleService' }));

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
                `Cache lookup failed for user ${userId}, falling back to direct DB query: ${error.message}`,
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
      }).pipe(Effect.annotateLogs({ service: 'CycleService' }));

    /**
     * Validate that updated dates don't overlap with adjacent cycles
     * For completed cycle date updates
     */
    const validateNoOverlapWithAdjacentCycles = (
      userId: string,
      cycleId: string,
      currentStartDate: Date,
      newStartDate: Date,
      newEndDate: Date,
    ): Effect.Effect<void, CycleOverlapError | CycleRepositoryError> =>
      Effect.gen(function* () {
        // Get adjacent cycles in parallel
        const [previousCycleOption, nextCycleOption] = yield* Effect.all([
          repository.getPreviousCycle(userId, cycleId, currentStartDate),
          repository.getNextCycle(userId, cycleId, currentStartDate),
        ]);

        // Validate against previous cycle: newStartDate must be >= previousCycle.endDate
        if (Option.isSome(previousCycleOption)) {
          const previousCycle = previousCycleOption.value;
          if (newStartDate < previousCycle.endDate) {
            return yield* Effect.fail(
              new CycleOverlapError({
                message: 'New start date overlaps with previous cycle',
                newStartDate,
                lastCompletedEndDate: previousCycle.endDate,
              }),
            );
          }
        }

        // Validate against next cycle: newEndDate must be <= nextCycle.startDate
        if (Option.isSome(nextCycleOption)) {
          const nextCycle = nextCycleOption.value;
          if (newEndDate > nextCycle.startDate) {
            return yield* Effect.fail(
              new CycleOverlapError({
                message: 'New end date overlaps with next cycle',
                newStartDate: newEndDate,
                lastCompletedEndDate: nextCycle.startDate,
              }),
            );
          }
        }
      });

    return {
      getCycle: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<CycleDetailResponse, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError> =>
        Effect.gen(function* () {
          let cycle: CycleRecord;

          const kvCycleOption = yield* cycleRefCache.getInProgressCycle(userId);

          if (Option.isSome(kvCycleOption) && kvCycleOption.value.id === cycleId) {
            yield* Effect.logDebug(`Found cycle ${cycleId} in RefCache (InProgress)`);
            cycle = kvCycleOption.value;
          } else {
            // If not in cache, check PostgreSQL (for Completed cycles)
            const dbCycleOption = yield* repository.getCycleById(userId, cycleId);

            if (Option.isNone(dbCycleOption)) {
              yield* Effect.logDebug(`Cycle ${cycleId} not found in either RefCache or DB`);
              return yield* Effect.fail(
                new CycleNotFoundError({
                  message: 'Cycle not found',
                  userId,
                }),
              );
            }

            yield* Effect.logDebug(`Found cycle ${cycleId} in PostgreSQL (Completed)`);
            cycle = dbCycleOption.value;
          }

          // Get adjacent cycles and feelings in parallel
          const [previousCycleOption, nextCycleOption, feelings] = yield* Effect.all([
            repository.getPreviousCycle(userId, cycleId, cycle.startDate),
            repository.getNextCycle(userId, cycleId, cycle.startDate),
            repository.getFeelingsByCycleId(cycleId),
          ]);

          // Build response with adjacent cycles and feelings
          const response: CycleDetailResponse = {
            ...cycle,
            feelings,
            previousCycle: Option.isSome(previousCycleOption)
              ? {
                  id: previousCycleOption.value.id,
                  startDate: previousCycleOption.value.startDate,
                  endDate: previousCycleOption.value.endDate,
                }
              : undefined,
            nextCycle: Option.isSome(nextCycleOption)
              ? {
                  id: nextCycleOption.value.id,
                  startDate: nextCycleOption.value.startDate,
                  endDate: nextCycleOption.value.endDate,
                }
              : undefined,
          };

          return response;
        }),

      getCycleInProgress: (
        userId: string,
      ): Effect.Effect<CycleWithFeelings, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError> =>
        Effect.gen(function* () {
          const cycle = yield* getActiveCycle(userId);
          return yield* attachFeelings(cycle);
        }),

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
        notes?: string,
      ): Effect.Effect<
        CycleWithFeelings,
        CycleAlreadyInProgressError | CycleOverlapError | CycleRepositoryError | CycleRefCacheError
      > =>
        Effect.gen(function* () {
          yield* validateNoOverlapWithLastCompleted(userId, startDate);

          const newCycle = yield* repository.createCycle({
            userId,
            status: 'InProgress',
            startDate,
            endDate,
            notes,
          });

          yield* cycleRefCache.setInProgressCycle(userId, newCycle).pipe(
            Effect.catchAll((kvError) =>
              Effect.gen(function* () {
                // Rollback: Delete the cycle from PostgreSQL since RefCache failed
                yield* Effect.logError(
                  `Failed to store cycle ${newCycle.id} in RefCache, rolling back Postgres INSERT`,
                );

                yield* repository
                  .deleteCycle(userId, newCycle.id)
                  .pipe(
                    Effect.catchAll((deleteError) =>
                      Effect.logError(
                        `CRITICAL: Failed to rollback cycle ${newCycle.id} from Postgres after RefCache failure: ${JSON.stringify(deleteError)}`,
                      ),
                    ),
                  );

                return yield* Effect.fail(kvError);
              }),
            ),
          );

          // New cycles have no feelings
          return { ...newCycle, feelings: [] };
        }),

      updateCycleDates: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
        notes?: string,
      ): Effect.Effect<
        CycleWithFeelings,
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
            notes: notes !== undefined ? notes : cycle.notes,
            updatedAt: new Date(),
          };

          yield* cycleRefCache.setInProgressCycle(userId, updatedCycle);

          // Persist to PostgreSQL in background (fire and forget)
          yield* repository.updateCycleDates(userId, cycleId, startDate, endDate, notes).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(`Failed to persist cycle dates to PostgreSQL: ${error.message}`),
            ),
            Effect.forkDaemon,
            Effect.ignore,
          );

          // Get feelings for response
          const feelings = yield* repository.getFeelingsByCycleId(cycleId);
          return { ...updatedCycle, feelings };
        }),

      completeCycle: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
        notes?: string,
      ): Effect.Effect<
        CycleWithFeelings,
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
          const completedCycle = yield* repository.completeCycle(userId, cycleId, startDate, endDate, notes);

          // Remove from KeyValueStore
          yield* cycleRefCache.removeInProgressCycle(userId);

          // Update completion cache
          yield* cycleCompletionCache.setLastCompletionDate(userId, completedCycle.endDate).pipe(
            Effect.tapError((error) =>
              Effect.logWarning(`Failed to update completion cache for user ${userId}: ${JSON.stringify(error)}`),
            ),
            Effect.ignore,
          );

          // Get feelings for response
          const feelings = yield* repository.getFeelingsByCycleId(cycleId);
          return { ...completedCycle, feelings };
        }),

      updateCompletedCycleDates: (
        userId: string,
        cycleId: string,
        startDate: Date,
        endDate: Date,
        notes?: string,
      ): Effect.Effect<
        CycleWithFeelings,
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

          if (cycle.status !== 'Completed') {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot update dates of a cycle that is not completed',
                currentState: cycle.status,
                expectedState: 'Completed',
              }),
            );
          }

          // Validate no overlap with adjacent cycles
          yield* validateNoOverlapWithAdjacentCycles(userId, cycleId, cycle.startDate, startDate, endDate);

          const updatedCycle = yield* repository.updateCompletedCycleDates(userId, cycleId, startDate, endDate, notes);

          // Check if this was the last completed cycle - if so, update the cache
          const lastCompletedOption = yield* repository.getLastCompletedCycle(userId);

          if (Option.isSome(lastCompletedOption) && lastCompletedOption.value.id === cycleId) {
            yield* Effect.logInfo(`Updated cycle ${cycleId} is the last completed cycle, updating cache`);

            yield* cycleCompletionCache.setLastCompletionDate(userId, updatedCycle.endDate).pipe(
              Effect.tapError((error) =>
                Effect.logWarning(`Failed to update completion cache for user ${userId}: ${JSON.stringify(error)}`),
              ),
              Effect.ignore,
            );
          } else {
            yield* Effect.logInfo(`Updated cycle ${cycleId} is not the last completed cycle, no cache update needed`);
          }

          // Get feelings for response
          const feelings = yield* repository.getFeelingsByCycleId(cycleId);
          return { ...updatedCycle, feelings };
        }),

      /**
       * Get a stream of validation updates for a user
       * Returns a stream of JSON strings containing the last completion date
       * The stream emits the current value first, then all future changes
       */
      getValidationStream: (userId: string): Effect.Effect<Stream.Stream<string>, CycleCompletionCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Creating validation stream for user ${userId}`);

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
       * Returns all cycles that overlap with the period, with proportional duration info
       */
      getCycleStatistics: (
        userId: string,
        periodType: PeriodType,
        date: Date,
        timezone?: string,
      ): Effect.Effect<
        {
          periodStart: Date;
          periodEnd: Date;
          periodType: PeriodType;
          cycles: CycleStatisticsItem[];
          totalEffectiveDuration: number;
        },
        CycleRepositoryError | TimezoneConversionError
      > =>
        Effect.gen(function* () {
          const { start: periodStart, end: periodEnd } = yield* calculatePeriodRange(periodType, date, timezone);

          yield* Effect.logInfo(
            `Getting cycle statistics for user ${userId}, period: ${periodType}, range: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
          );

          const rawCycles = yield* repository.getCyclesByPeriod(userId, periodStart, periodEnd);

          // Transform cycles to include proportional duration info and feelings
          const cycles: CycleStatisticsItem[] = yield* Effect.all(
            rawCycles.map((cycle) =>
              Effect.gen(function* () {
                const durationInfo = calculateEffectiveDuration(cycle, periodStart, periodEnd);
                const feelings = yield* repository.getFeelingsByCycleId(cycle.id);
                return {
                  ...cycle,
                  ...durationInfo,
                  feelings,
                };
              }),
            ),
          );

          // Calculate total effective duration
          const totalEffectiveDuration = cycles.reduce((sum, cycle) => sum + cycle.effectiveDuration, 0);

          yield* Effect.logInfo(
            `Found ${cycles.length} cycles in period, total effective duration: ${totalEffectiveDuration}ms`,
          );

          return {
            periodStart,
            periodEnd,
            periodType,
            cycles,
            totalEffectiveDuration,
          };
        }),

      /**
       * Delete a completed cycle
       * Only cycles with status 'Completed' can be deleted
       * Cycles in progress cannot be deleted
       */
      deleteCycle: (
        userId: string,
        cycleId: string,
      ): Effect.Effect<void, CycleNotFoundError | CycleInvalidStateError | CycleRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting cycle ${cycleId} for user ${userId}`);

          // Get the cycle to verify it exists and check its state
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

          // Only completed cycles can be deleted
          if (cycle.status !== 'Completed') {
            return yield* Effect.fail(
              new CycleInvalidStateError({
                message: 'Cannot delete a cycle that is in progress',
                currentState: cycle.status,
                expectedState: 'Completed',
              }),
            );
          }

          // Check if this is the last completed cycle before deleting
          const lastCompletedOption = yield* repository.getLastCompletedCycle(userId);
          const isLastCompleted = Option.isSome(lastCompletedOption) && lastCompletedOption.value.id === cycleId;

          yield* repository.deleteCycle(userId, cycleId);

          yield* Effect.logInfo(`Cycle ${cycleId} deleted successfully`);

          // Invalidate cache after successful deletion (best-effort)
          if (isLastCompleted) {
            yield* Effect.logInfo(`Cycle ${cycleId} was the last completed cycle, invalidating completion cache`);
            yield* cycleCompletionCache.invalidate(userId).pipe(
              Effect.tapError((error) =>
                Effect.logWarning(`Failed to invalidate completion cache for user ${userId}: ${JSON.stringify(error)}`),
              ),
              Effect.ignore,
            );
          }
        }),

      /**
       * Update only the notes of a cycle (either InProgress or Completed)
       * Used by the notes Save button to save notes independently of dates
       */
      updateCycleNotes: (
        userId: string,
        cycleId: string,
        notes: string,
      ): Effect.Effect<CycleWithFeelings, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating notes for cycle ${cycleId}`);

          // Get the cycle first to check if it exists and its status
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

          // If the cycle is InProgress, update the cache first
          if (cycle.status === 'InProgress') {
            const updatedCycle: CycleRecord = {
              ...cycle,
              notes,
              updatedAt: new Date(),
            };
            yield* cycleRefCache.setInProgressCycle(userId, updatedCycle);
          }

          // Persist to database
          const result = yield* repository.updateCycleNotes(userId, cycleId, notes);

          yield* Effect.logInfo(`Notes updated successfully for cycle ${cycleId}`);

          // Get feelings for response
          const feelings = yield* repository.getFeelingsByCycleId(cycleId);
          return { ...result, feelings };
        }),

      /**
       * Update the feelings of a cycle (either InProgress or Completed)
       * Replaces all existing feelings with the new array
       */
      updateCycleFeelings: (
        userId: string,
        cycleId: string,
        feelings: FastingFeeling[],
      ): Effect.Effect<CycleWithFeelings, CycleNotFoundError | CycleRepositoryError | CycleRefCacheError | FeelingsLimitExceededError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating feelings for cycle ${cycleId}`);

          // Get the cycle first to check if it exists
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

          // Update feelings in database
          const updatedFeelings = yield* repository.updateCycleFeelings(cycleId, feelings);

          yield* Effect.logInfo(`Feelings updated successfully for cycle ${cycleId}`);

          return { ...cycle, feelings: updatedFeelings };
        }),
    };
  }),
  dependencies: [CycleRepository.Default, CycleCompletionCache.Default, CycleRefCache.Default],
  accessors: true,
}) {}
