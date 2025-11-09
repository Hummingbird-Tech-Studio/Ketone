import { Effect, Option, Schema as S } from 'effect';
import { RedisDatabase } from '../../../db/providers/redis/connection';
import { RedisKeys, RedisSerializers } from '../../../db/providers/redis/schema';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, CycleRecordSchema, type CycleRecord } from './schemas';
import type { ICycleRepository } from './cycle.repository.interface';
import { randomUUID } from 'node:crypto';

const isLuaErrorWithMessage =
  (message: string) =>
  (error: unknown): boolean => {
    return error instanceof Error && error.message.includes(message);
  };

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

          // Check ownership
          if (validated.userId !== userId) {
            return Option.none();
          }

          return Option.some(validated);
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in getCycleById', error))),

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
              `Inconsistency detected: active index exists but cycle data missing for ${cycleId}`,
            );
            return Option.none();
          }

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
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in getActiveCycle', error))),

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
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in getLastCompletedCycle', error))),

      createCycle: (data: CycleData) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Creating cycle for user: ${data.userId}`);

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
              // If creating InProgress cycle, use Lua script for atomic check-and-set
              if (data.status === 'InProgress') {
                const activeKey = RedisKeys.userActive(data.userId);
                const cycleKey = RedisKeys.cycle(cycleId);
                const cycleHash = RedisSerializers.cycleToHash(cycleRecord);

                // Lua script for atomic createCycle operation
                // KEYS[1] = activeKey (user:${userId}:active)
                // KEYS[2] = cycleKey (cycle:${cycleId})
                // ARGV[1...N] = cycleHash fields (flattened key-value pairs)
                // ARGV[last] = cycleId
                const luaScript = `
                  local activeKey = KEYS[1]
                  local cycleKey = KEYS[2]
                  local cycleId = ARGV[#ARGV]

                  -- Check if user already has an active cycle
                  local existingActive = redis.call('GET', activeKey)
                  if existingActive then
                    return redis.error_reply('ALREADY_IN_PROGRESS')
                  end

                  -- Create cycle hash
                  local cycleFields = {}
                  for i = 1, #ARGV - 1 do
                    table.insert(cycleFields, ARGV[i])
                  end
                  redis.call('HSET', cycleKey, unpack(cycleFields))

                  -- Set active index
                  redis.call('SET', activeKey, cycleId)

                  return 'OK'
                `;

                // Flatten hash for ARGV: [key1, value1, key2, value2, ..., cycleId]
                const hashArgs: (string | number)[] = [];
                for (const [key, value] of Object.entries(cycleHash)) {
                  hashArgs.push(key, value);
                }
                hashArgs.push(cycleId);

                await redis.eval(luaScript, 2, activeKey, cycleKey, ...hashArgs);
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
              if (isLuaErrorWithMessage('ALREADY_IN_PROGRESS')(error)) {
                return new CycleAlreadyInProgressError({
                  message: 'User already has a cycle in progress',
                  userId: data.userId,
                });
              }
              // All other errors become CycleRepositoryError
              return new CycleRepositoryError({
                message: 'Failed to create cycle in Redis',
                cause: error,
              });
            },
          });

          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate created cycle record',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in createCycle', error))),

      updateCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Updating cycle dates: ${cycleId} for user: ${userId}`);

          const result = yield* Effect.tryPromise({
            try: async () => {
              const cycleKey = RedisKeys.cycle(cycleId);
              const now = new Date();

              // Lua script for atomic updateCycleDates operation
              // KEYS[1] = cycleKey (cycle:${cycleId})
              // ARGV[1] = userId
              // ARGV[2] = startDate (ISO string)
              // ARGV[3] = endDate (ISO string)
              // ARGV[4] = updatedAt (ISO string)
              const luaScript = `
                local cycleKey = KEYS[1]
                local userId = ARGV[1]
                local newStartDate = ARGV[2]
                local newEndDate = ARGV[3]
                local updatedAt = ARGV[4]

                -- Check if cycle exists
                local exists = redis.call('EXISTS', cycleKey)
                if exists == 0 then
                  return redis.error_reply('NOT_FOUND')
                end

                -- Get cycle data for validation
                local cycleUserId = redis.call('HGET', cycleKey, 'userId')
                local cycleStatus = redis.call('HGET', cycleKey, 'status')

                -- Validate ownership
                if cycleUserId ~= userId then
                  return redis.error_reply('WRONG_USER')
                end

                -- Validate status
                if cycleStatus ~= 'InProgress' then
                  return redis.error_reply('INVALID_STATE:' .. (cycleStatus or 'Unknown'))
                end

                -- Update cycle dates
                redis.call('HSET', cycleKey, 'startDate', newStartDate, 'endDate', newEndDate, 'updatedAt', updatedAt)

                -- Return updated cycle
                return redis.call('HGETALL', cycleKey)
              `;

              const updatedHash = await redis.eval(
                luaScript,
                1,
                cycleKey,
                userId,
                startDate.toISOString(),
                endDate.toISOString(),
                now.toISOString(),
              );

              // Convert array response [key1, value1, key2, value2, ...] to object
              const hashObj: Record<string, string> = {};
              for (let i = 0; i < updatedHash.length; i += 2) {
                hashObj[updatedHash[i]] = updatedHash[i + 1];
              }

              return RedisSerializers.hashToCycle(hashObj);
            },
            catch: (error) => {
              if (isLuaErrorWithMessage('NOT_FOUND')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not exist',
                  currentState: 'Not Found',
                  expectedState: 'InProgress',
                });
              }

              if (isLuaErrorWithMessage('WRONG_USER')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not belong to user',
                  currentState: 'Wrong User',
                  expectedState: 'InProgress',
                });
              }

              if (isLuaErrorWithMessage('INVALID_STATE')(error)) {
                const currentState = error instanceof Error ? error.message.split(':')[1] || 'Unknown' : 'Unknown';
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that is not in progress',
                  currentState,
                  expectedState: 'InProgress',
                });
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
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in updateCycleDates', error))),

      completeCycle: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Completing cycle: ${cycleId} for user: ${userId}`);

          const result = yield* Effect.tryPromise({
            try: async () => {
              const cycleKey = RedisKeys.cycle(cycleId);
              const activeKey = RedisKeys.userActive(userId);
              const completedKey = RedisKeys.userCompleted(userId);
              const score = RedisKeys.timestamp(endDate);
              const now = new Date();

              // Lua script for atomic completeCycle operation
              // KEYS[1] = cycleKey (cycle:${cycleId})
              // KEYS[2] = activeKey (user:${userId}:active)
              // KEYS[3] = completedKey (user:${userId}:completed)
              // ARGV[1] = userId
              // ARGV[2] = startDate (ISO string)
              // ARGV[3] = endDate (ISO string)
              // ARGV[4] = updatedAt (ISO string)
              // ARGV[5] = score (timestamp for sorted set)
              // ARGV[6] = cycleId
              const luaScript = `
                local cycleKey = KEYS[1]
                local activeKey = KEYS[2]
                local completedKey = KEYS[3]
                local userId = ARGV[1]
                local newStartDate = ARGV[2]
                local newEndDate = ARGV[3]
                local updatedAt = ARGV[4]
                local score = tonumber(ARGV[5])
                local cycleId = ARGV[6]

                -- Check if cycle exists
                local exists = redis.call('EXISTS', cycleKey)
                if exists == 0 then
                  return redis.error_reply('NOT_FOUND')
                end

                -- Get cycle data for validation
                local cycleUserId = redis.call('HGET', cycleKey, 'userId')
                local cycleStatus = redis.call('HGET', cycleKey, 'status')

                -- Validate ownership
                if cycleUserId ~= userId then
                  return redis.error_reply('WRONG_USER')
                end

                -- Validate status
                if cycleStatus ~= 'InProgress' then
                  return redis.error_reply('INVALID_STATE:' .. (cycleStatus or 'Unknown'))
                end

                -- Update cycle status and dates
                redis.call('HSET', cycleKey,
                  'status', 'Completed',
                  'startDate', newStartDate,
                  'endDate', newEndDate,
                  'updatedAt', updatedAt
                )

                -- Remove from active index
                redis.call('DEL', activeKey)

                -- Add to completed index
                redis.call('ZADD', completedKey, score, cycleId)

                -- Return updated cycle
                return redis.call('HGETALL', cycleKey)
              `;

              const updatedHash = await redis.eval(
                luaScript,
                3,
                cycleKey,
                activeKey,
                completedKey,
                userId,
                startDate.toISOString(),
                endDate.toISOString(),
                now.toISOString(),
                score.toString(),
                cycleId,
              );

              // Convert array response [key1, value1, key2, value2, ...] to object
              const hashObj: Record<string, string> = {};
              for (let i = 0; i < updatedHash.length; i += 2) {
                hashObj[updatedHash[i]] = updatedHash[i + 1];
              }

              return RedisSerializers.hashToCycle(hashObj);
            },
            catch: (error) => {
              if (isLuaErrorWithMessage('NOT_FOUND')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that does not exist',
                  currentState: 'Not Found',
                  expectedState: 'InProgress',
                });
              }

              if (isLuaErrorWithMessage('WRONG_USER')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that does not belong to user',
                  currentState: 'Wrong User',
                  expectedState: 'InProgress',
                });
              }

              if (isLuaErrorWithMessage('INVALID_STATE')(error)) {
                const currentState = error instanceof Error ? error.message.split(':')[1] || 'Unknown' : 'Unknown';
                return new CycleInvalidStateError({
                  message: 'Cannot complete a cycle that is not in progress',
                  currentState,
                  expectedState: 'InProgress',
                });
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
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in completeCycle', error))),

      updateCompletedCycleDates: (userId: string, cycleId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Updating completed cycle dates: ${cycleId} for user: ${userId}`);

          const result = yield* Effect.tryPromise({
            try: async () => {
              const cycleKey = RedisKeys.cycle(cycleId);
              const completedKey = RedisKeys.userCompleted(userId);
              const newScore = RedisKeys.timestamp(endDate);
              const now = new Date();

              // Lua script for atomic updateCompletedCycleDates operation
              // KEYS[1] = cycleKey (cycle:${cycleId})
              // KEYS[2] = completedKey (user:${userId}:completed)
              // ARGV[1] = userId
              // ARGV[2] = startDate (ISO string)
              // ARGV[3] = endDate (ISO string)
              // ARGV[4] = updatedAt (ISO string)
              // ARGV[5] = newScore (timestamp for sorted set)
              // ARGV[6] = cycleId
              const luaScript = `
                local cycleKey = KEYS[1]
                local completedKey = KEYS[2]
                local userId = ARGV[1]
                local newStartDate = ARGV[2]
                local newEndDate = ARGV[3]
                local updatedAt = ARGV[4]
                local newScore = tonumber(ARGV[5])
                local cycleId = ARGV[6]

                -- Check if cycle exists
                local exists = redis.call('EXISTS', cycleKey)
                if exists == 0 then
                  return redis.error_reply('NOT_FOUND')
                end

                -- Get cycle data for validation
                local cycleUserId = redis.call('HGET', cycleKey, 'userId')
                local cycleStatus = redis.call('HGET', cycleKey, 'status')

                -- Validate ownership
                if cycleUserId ~= userId then
                  return redis.error_reply('WRONG_USER')
                end

                -- Validate status
                if cycleStatus ~= 'Completed' then
                  return redis.error_reply('INVALID_STATE:' .. (cycleStatus or 'Unknown'))
                end

                -- Update cycle dates
                redis.call('HSET', cycleKey, 'startDate', newStartDate, 'endDate', newEndDate, 'updatedAt', updatedAt)

                -- Update score in sorted set (in case endDate changed)
                redis.call('ZADD', completedKey, newScore, cycleId)

                -- Return updated cycle
                return redis.call('HGETALL', cycleKey)
              `;

              const updatedHash = await redis.eval(
                luaScript,
                2,
                cycleKey,
                completedKey,
                userId,
                startDate.toISOString(),
                endDate.toISOString(),
                now.toISOString(),
                newScore.toString(),
                cycleId,
              );

              // Convert array response [key1, value1, key2, value2, ...] to object
              const hashObj: Record<string, string> = {};
              for (let i = 0; i < updatedHash.length; i += 2) {
                hashObj[updatedHash[i]] = updatedHash[i + 1];
              }

              return RedisSerializers.hashToCycle(hashObj);
            },
            catch: (error) => {
              if (isLuaErrorWithMessage('NOT_FOUND')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not exist',
                  currentState: 'Not Found',
                  expectedState: 'Completed',
                });
              }

              if (isLuaErrorWithMessage('WRONG_USER')(error)) {
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that does not belong to user',
                  currentState: 'Wrong User',
                  expectedState: 'Completed',
                });
              }

              if (isLuaErrorWithMessage('INVALID_STATE')(error)) {
                const currentState = error instanceof Error ? error.message.split(':')[1] || 'Unknown' : 'Unknown';
                return new CycleInvalidStateError({
                  message: 'Cannot update dates of a cycle that is not completed',
                  currentState,
                  expectedState: 'Completed',
                });
              }

              return new CycleRepositoryError({
                message: 'Failed to update completed cycle dates in Redis',
                cause: error,
              });
            },
          });

          return yield* S.decodeUnknown(CycleRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new CycleRepositoryError({
                  message: 'Failed to validate updated completed cycle record',
                  cause: error,
                }),
            ),
          );
        }).pipe(Effect.tapError((error) => Effect.logError('❌ Error in updateCompletedCycleDates', error))),
    };

    return repository;
  }),
  accessors: true,
}) {}
