import { Effect, Option, Schema as S } from 'effect';
import { RedisDatabase } from '../../../db/providers/redis/connection';
import { RedisKeys, RedisSerializers } from '../../../db/providers/redis/schema';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, CycleRecordSchema, type CycleRecord } from './schemas';
import type { ICycleRepository } from './cycle.repository.interface';
import { randomUUID } from 'node:crypto';

/**
 * Redis implementation of the Cycle Repository.
 *
 * Uses Redis for high-performance cycle data storage with:
 * - Redis Hashes for structured cycle data
 * - Sorted Sets for time-ordered indexes
 * - MULTI/EXEC transactions for atomicity
 *
 * Implements the ICycleRepository interface to ensure compatibility with
 * other database implementations.
 */
export class CycleRepositoryRedis extends Effect.Service<CycleRepositoryRedis>()('CycleRepository', {
  effect: Effect.gen(function* () {
    const redis = yield* RedisDatabase;

    const repository: ICycleRepository = {
      getCycleById: (userId: string, cycleId: string) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Getting cycle by ID: ${cycleId} for user: ${userId}`);

          const cycleKey = RedisKeys.cycle(cycleId);
          const cycleHash = yield* Effect.tryPromise({
            try: () => redis.hgetall(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle by ID from Redis',
                cause: error,
              }),
          });

          // Check if hash is empty (cycle doesn't exist)
          if (!cycleHash || Object.keys(cycleHash).length === 0) {
            return Option.none();
          }

          // Convert hash to cycle record
          const cycleData = RedisSerializers.hashToCycle(cycleHash);

          // Validate cycle data
          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from Redis',
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

          const activeKey = RedisKeys.userActive(userId);
          const cycleId = yield* Effect.tryPromise({
            try: () => redis.get(activeKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get active cycle from Redis',
                cause: error,
              }),
          });

          if (!cycleId) {
            return Option.none();
          }

          // Get full cycle data
          const cycleKey = RedisKeys.cycle(cycleId);
          const cycleHash = yield* Effect.tryPromise({
            try: () => redis.hgetall(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle data from Redis',
                cause: error,
              }),
          });

          if (!cycleHash || Object.keys(cycleHash).length === 0) {
            // Inconsistency: index exists but data doesn't
            yield* Effect.logWarning(
              `Inconsistency detected: active index exists but cycle data missing for ${cycleId}`,
            );
            return Option.none();
          }

          // Convert hash to cycle record
          const cycleData = RedisSerializers.hashToCycle(cycleHash);

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from Redis',
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

          const completedKey = RedisKeys.userCompleted(userId);

          // Get the most recent completed cycle (highest score)
          const result = yield* Effect.tryPromise({
            try: () => redis.zrevrange(completedKey, 0, 0),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to scan completed cycles in Redis',
                cause: error,
              }),
          });

          if (!result || result.length === 0) {
            return Option.none();
          }

          const cycleId = result[0] as string;

          // Get full cycle data
          const cycleKey = RedisKeys.cycle(cycleId);
          const cycleHash = yield* Effect.tryPromise({
            try: () => redis.hgetall(cycleKey),
            catch: (error) =>
              new CycleRepositoryError({
                message: 'Failed to get cycle data from Redis',
                cause: error,
              }),
          });

          if (!cycleHash || Object.keys(cycleHash).length === 0) {
            yield* Effect.logWarning(
              `Inconsistency detected: completed index exists but cycle data missing for ${cycleId}`,
            );
            return Option.none();
          }

          // Convert hash to cycle record
          const cycleData = RedisSerializers.hashToCycle(cycleHash);

          const validated = yield* S.decodeUnknown(CycleRecordSchema)(cycleData).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate cycle record from Redis',
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

          // Generate cycle data
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

          const result = yield* Effect.tryPromise({
            try: async () => {
              // If creating InProgress cycle, use WATCH for optimistic locking
              if (data.status === 'InProgress') {
                const activeKey = RedisKeys.userActive(data.userId);

                // Check if user already has an active cycle
                const existingActive = await redis.get(activeKey);
                if (existingActive) {
                  throw new CycleAlreadyInProgressError({
                    message: 'User already has a cycle in progress',
                    userId: data.userId,
                  });
                }

                // Use transaction to create cycle and set active
                const cycleKey = RedisKeys.cycle(cycleId);
                const cycleHash = RedisSerializers.cycleToHash(cycleRecord);

                const pipeline = redis.multi();
                pipeline.hset(cycleKey, cycleHash);
                pipeline.set(activeKey, cycleId);
                await pipeline.exec();
              } else {
                // Completed cycle: create cycle and add to sorted set
                const cycleKey = RedisKeys.cycle(cycleId);
                const cycleHash = RedisSerializers.cycleToHash(cycleRecord);
                const completedKey = RedisKeys.userCompleted(data.userId);
                const score = RedisKeys.timestamp(data.endDate);

                const pipeline = redis.multi();
                pipeline.hset(cycleKey, cycleHash);
                pipeline.zadd(completedKey, score, cycleId);
                await pipeline.exec();
              }

              return cycleRecord;
            },
            catch: (error) => {
              if (error instanceof CycleAlreadyInProgressError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to create cycle in Redis',
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
            try: async () => {
              const cycleKey = RedisKeys.cycle(cycleId);

              // Get existing cycle to validate
              const existingHash = await redis.hgetall(cycleKey);

              if (!existingHash || Object.keys(existingHash).length === 0) {
                throw new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not exist',
                  currentState: 'Not Found',
                  expectedState: 'InProgress',
                });
              }

              // Check ownership and status
              if (existingHash.userId !== userId) {
                throw new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not belong to user',
                  currentState: 'Wrong User',
                  expectedState: 'InProgress',
                });
              }

              if (existingHash.status !== 'InProgress') {
                throw new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that is not in progress',
                  currentState: existingHash.status || 'Unknown',
                  expectedState: 'InProgress',
                });
              }

              // Update cycle dates
              const now = new Date();
              await redis.hset(cycleKey, {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                updatedAt: now.toISOString(),
              });

              // Return updated cycle
              const updatedHash = await redis.hgetall(cycleKey);
              return RedisSerializers.hashToCycle(updatedHash);
            },
            catch: (error) => {
              if (error instanceof CycleInvalidStateError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to update cycle dates in Redis',
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
            try: async () => {
              const cycleKey = RedisKeys.cycle(cycleId);

              // Get existing cycle to validate
              const existingHash = await redis.hgetall(cycleKey);

              if (!existingHash || Object.keys(existingHash).length === 0) {
                throw new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that does not exist',
                  currentState: 'Not Found',
                  expectedState: 'InProgress',
                });
              }

              // Check ownership and status
              if (existingHash.userId !== userId) {
                throw new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that does not belong to user',
                  currentState: 'Wrong User',
                  expectedState: 'InProgress',
                });
              }

              if (existingHash.status !== 'InProgress') {
                throw new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that is not in progress',
                  currentState: existingHash.status || 'Unknown',
                  expectedState: 'InProgress',
                });
              }

              // Update cycle and indexes in transaction
              const now = new Date();
              const activeKey = RedisKeys.userActive(userId);
              const completedKey = RedisKeys.userCompleted(userId);
              const score = RedisKeys.timestamp(endDate);

              const pipeline = redis.multi();
              pipeline.hset(cycleKey, {
                status: 'Completed',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                updatedAt: now.toISOString(),
              });
              pipeline.del(activeKey);
              pipeline.zadd(completedKey, score, cycleId);
              await pipeline.exec();

              // Return updated cycle
              const updatedHash = await redis.hgetall(cycleKey);
              return RedisSerializers.hashToCycle(updatedHash);
            },
            catch: (error) => {
              if (error instanceof CycleInvalidStateError) {
                return error;
              }
              return new CycleRepositoryError({
                message: 'Failed to complete cycle in Redis',
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
