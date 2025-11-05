import { Effect, Option, Schema as S } from 'effect';
import { LmdbDatabase } from '../../../db/providers/lmdb/connection';
import { LmdbKeys } from '../../../db/providers/lmdb/schema';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, CycleRecordSchema, type CycleRecord } from './schemas';
import type { ICycleRepository } from './cycle.repository.interface';
import { randomUUID } from 'node:crypto';

/**
 * LMDB implementation of the Cycle Repository.
 *
 * Uses LMDB (Lightning Memory-Mapped Database) for high-performance
 * cycle data storage with ACID transactions and efficient key-value operations.
 *
 * Implements the ICycleRepository interface to ensure compatibility with
 * other database implementations.
 */
export class CycleRepositoryLmdb extends Effect.Service<CycleRepositoryLmdb>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const db = yield* LmdbDatabase;

    const repository: ICycleRepository = {
      getCycleById: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting cycle by ID: ${cycleId} for user: ${userId}`);

          const cycleKey = LmdbKeys.cycle(cycleId);
          const cycleData = yield* Effect.try({
            try: () => db.get(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle by ID from LMDB',
                cause: error,
              }),
          });

          if (!cycleData) {
            return Option.none();
          }

          // Validate that cycle belongs to the user
          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from LMDB',
                  cause: error,
                }),
            ),
          );

          // Check ownership
          if (validated.userId !== userId) {
            return Option.none();
          }

          return Option.some(validated);
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in getCycleById', error)),
        ),

      getActiveCycle: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting active cycle for user: ${userId}`);

          const activeKey = LmdbKeys.userActive(userId);
          const cycleId = yield* Effect.try({
            try: () => db.get(activeKey) as string | undefined,
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get active cycle from LMDB',
                cause: error,
              }),
          });

          if (!cycleId) {
            return Option.none();
          }

          // Get full cycle data
          const cycleKey = LmdbKeys.cycle(cycleId);
          const cycleData = yield* Effect.try({
            try: () => db.get(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle data from LMDB',
                cause: error,
              }),
          });

          if (!cycleData) {
            // Inconsistency: index exists but data doesn't
            yield* Effect.logWarning(
              `Inconsistency detected: active index exists but cycle data missing for ${cycleId}`,
            );
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from LMDB',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in getActiveCycle', error)),
        ),

      getLastCompletedCycle: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting last completed cycle for user: ${userId}`);

          const prefix = `user:${userId}:completed:`;

          // Scan for the first key matching the prefix (lowest reverseTimestamp = highest actual timestamp)
          const firstKey = yield* Effect.try({
            try: () => {
              const range = db.getRange({ start: prefix });
              // Get first entry from range
              for (const { key, value } of range) {
                const keyStr = String(key);
                // Make sure the key actually starts with our prefix (not just lexicographically after)
                if (!keyStr.startsWith(prefix)) {
                  return null;
                }
                return { key: keyStr, cycleId: value as string };
              }
              return null;
            },
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to scan completed cycles in LMDB',
                cause: error,
              }),
          });

          if (!firstKey) {
            return Option.none();
          }

          // Get full cycle data
          const cycleKey = LmdbKeys.cycle(firstKey.cycleId);
          const cycleData = yield* Effect.try({
            try: () => db.get(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle data from LMDB',
                cause: error,
              }),
          });

          if (!cycleData) {
            yield* Effect.logWarning(
              `Inconsistency detected: completed index exists but cycle data missing for ${firstKey.cycleId}`,
            );
            return Option.none();
          }

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from LMDB',
                  cause: error,
                }),
            ),
          );

          return Option.some(validated);
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in getLastCompletedCycle', error)),
        ),

      createCycle: (data: CycleData) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Creating cycle for user: ${data.userId}`);

          // Execute in transaction for atomicity
          const result = yield* Effect.tryPromise({
            try: () =>
              Promise.resolve(
                db.transactionSync(() => {
                  // If creating InProgress cycle, check for existing active cycle
                  if (data.status === 'InProgress') {
                    const activeKey = LmdbKeys.userActive(data.userId);
                    const existingActiveId = db.get(activeKey);

                    if (existingActiveId) {
                      throw new CycleAlreadyInProgressError({
                        message: 'User already has a cycle in progress',
                        userId: data.userId,
                      });
                    }
                  }

                  // Generate new cycle ID and timestamps
                  const cycleId = randomUUID();
                  const now = new Date();
                  const cycleRecord: CycleRecord = {
                    id: cycleId,
                    userId: data.userId,
                    status: data.status,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    createdAt: now,
                    updatedAt: now,
                  };

                  // Store cycle data
                  const cycleKey = LmdbKeys.cycle(cycleId);
                  db.put(cycleKey, cycleRecord);

                  // Update indexes based on status
                  if (data.status === 'InProgress') {
                    const activeKey = LmdbKeys.userActive(data.userId);
                    db.put(activeKey, cycleId);
                  } else {
                    // Completed cycle: add to completed index
                    const reverseTimestamp = LmdbKeys.reverseTimestamp(data.endDate);
                    const completedKey = LmdbKeys.userCompleted(data.userId, reverseTimestamp, cycleId);
                    db.put(completedKey, cycleId);
                  }

                  return cycleRecord;
                }),
              ),
            catch: (error) => {
              // Check if it's already a domain error
              if (error instanceof CycleAlreadyInProgressError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to create cycle in LMDB',
                cause: error,
              });
            },
          });

          // Validate the created cycle
          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate created cycle record',
                  cause: error,
                }),
            ),
          );
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in createCycle', error)),
        ),

      updateCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Updating cycle dates: ${cycleId} for user: ${userId}`);

          const result = yield* Effect.tryPromise({
            try: () =>
              Promise.resolve(
                db.transactionSync(() => {
                  // Get existing cycle
                  const cycleKey = LmdbKeys.cycle(cycleId);
                  const existingCycle = db.get(cycleKey);

                  if (!existingCycle) {
                    throw new CycleInvalidStateError({
                      message: 'Cannot update dates of a cycle that does not exist',
                      currentState: 'Not Found',
                      expectedState: 'InProgress',
                    });
                  }

                  // Validate ownership and status
                  if (existingCycle.userId !== userId) {
                    throw new CycleInvalidStateError({
                      message: 'Cannot update dates of a cycle that does not belong to user',
                      currentState: 'Wrong User',
                      expectedState: 'InProgress',
                    });
                  }

                  if (existingCycle.status !== 'InProgress') {
                    throw new CycleInvalidStateError({
                      message: 'Cannot update dates of a cycle that is not in progress',
                      currentState: existingCycle.status,
                      expectedState: 'InProgress',
                    });
                  }

                  // Update cycle
                  const updatedCycle: CycleRecord = {
                    ...existingCycle,
                    startDate,
                    endDate,
                    updatedAt: new Date(),
                  };

                  db.put(cycleKey, updatedCycle);

                  return updatedCycle;
                }),
              ),
            catch: (error) => {
              if (error instanceof CycleInvalidStateError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to update cycle dates in LMDB',
                cause: error,
              });
            },
          });

          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate updated cycle record',
                  cause: error,
                }),
            ),
          );
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in updateCycleDates', error)),
        ),

      completeCycle: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Completing cycle: ${cycleId} for user: ${userId}`);

          const result = yield* Effect.tryPromise({
            try: () =>
              Promise.resolve(
                db.transactionSync(() => {
                  // Get existing cycle
                  const cycleKey = LmdbKeys.cycle(cycleId);
                  const existingCycle = db.get(cycleKey);

                  if (!existingCycle) {
                    throw new CycleInvalidStateError({
                      message: 'Cannot complete a cycle that does not exist',
                      currentState: 'Not Found',
                      expectedState: 'InProgress',
                    });
                  }

                  // Validate ownership and status
                  if (existingCycle.userId !== userId) {
                    throw new CycleInvalidStateError({
                      message: 'Cannot complete a cycle that does not belong to user',
                      currentState: 'Wrong User',
                      expectedState: 'InProgress',
                    });
                  }

                  if (existingCycle.status !== 'InProgress') {
                    throw new CycleInvalidStateError({
                      message: 'Cannot complete a cycle that is not in progress',
                      currentState: existingCycle.status,
                      expectedState: 'InProgress',
                    });
                  }

                  // Update cycle status and dates
                  const completedCycle: CycleRecord = {
                    ...existingCycle,
                    status: 'Completed',
                    startDate,
                    endDate,
                    updatedAt: new Date(),
                  };

                  db.put(cycleKey, completedCycle);

                  // Update indexes: remove from active, add to completed
                  const activeKey = LmdbKeys.userActive(userId);
                  db.remove(activeKey);

                  const reverseTimestamp = LmdbKeys.reverseTimestamp(endDate);
                  const completedKey = LmdbKeys.userCompleted(userId, reverseTimestamp, cycleId);
                  db.put(completedKey, cycleId);

                  return completedCycle;
                }),
              ),
            catch: (error) => {
              if (error instanceof CycleInvalidStateError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to complete cycle in LMDB',
                cause: error,
              });
            },
          });

          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate completed cycle record',
                  cause: error,
                }),
            ),
          );
        }).pipe(
          Effect.tapError((error) => Effect.logError('❌ Error in completeCycle', error)),
        ),
    };

    return repository;
  }),
  accessors: true,
}) {}
