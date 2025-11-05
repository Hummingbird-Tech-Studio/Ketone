/**
 * Redis Key Schema for Cycle Storage
 *
 * This file documents the key structure and data types for storing
 * cycle data in Redis. We leverage Redis native data structures for
 * optimal performance and atomic operations.
 *
 * Key Design Principles:
 * 1. Use Redis Hashes for structured cycle data
 * 2. Use Sorted Sets for time-ordered indexes
 * 3. Use Strings for simple references
 * 4. Leverage Redis atomic operations for consistency
 *
 * Data Structures Used:
 * - HASH: For storing complete cycle records with fields
 * - ZSET (Sorted Set): For ordered indexes of completed cycles
 * - STRING: For active cycle reference
 */

/**
 * Key Types and Their Purposes
 */
export const RedisKeys = {
  /**
   * PRIMARY STORE: Complete cycle data
   * Type: HASH
   * Key: `cycle:{cycleId}`
   * Fields: id, userId, status, startDate, endDate, createdAt, updatedAt
   *
   * Example:
   *   HSET cycle:123e4567 id "123e4567" userId "user123" status "InProgress" ...
   *
   * Used by:
   * - getCycleById() → HGETALL cycle:{cycleId}
   * - All operations that need full cycle data
   *
   * Commands:
   * - HSET cycle:{cycleId} field value [field value ...] - Create/update cycle
   * - HGETALL cycle:{cycleId} - Retrieve complete cycle
   * - HDEL cycle:{cycleId} - Delete cycle (cleanup)
   * - HEXISTS cycle:{cycleId} - Check existence
   */
  cycle: (cycleId: string) => `cycle:${cycleId}`,

  /**
   * INDEX: Active cycle for a user
   * Type: STRING
   * Key: `user:{userId}:active`
   * Value: cycleId (string) or not exists if no active cycle
   *
   * Example:
   *   SET user:abc123:active "cycle123"
   *
   * Used by:
   * - getActiveCycle() → GET + HGETALL
   * - Enforces business rule: only ONE active cycle per user
   *
   * Commands:
   * - SET user:{userId}:active {cycleId} - Mark cycle as active
   * - GET user:{userId}:active - Get active cycle ID
   * - DEL user:{userId}:active - Remove active cycle
   * - EXISTS user:{userId}:active - Check if user has active cycle
   *
   * Implementation note:
   * - When creating InProgress cycle: SET this key (check first with EXISTS)
   * - When completing cycle: DEL this key
   * - Use WATCH/MULTI/EXEC for atomic check-and-set
   */
  userActive: (userId: string) => `user:${userId}:active`,

  /**
   * INDEX: Completed cycles ordered by endDate (descending)
   * Type: SORTED SET (ZSET)
   * Key: `user:{userId}:completed`
   * Score: endDate timestamp (milliseconds)
   * Member: cycleId (string)
   *
   * Example:
   *   ZADD user:abc123:completed 1704067200000 "cycle123"
   *
   * Used by:
   * - getLastCompletedCycle() → ZREVRANGE (descending order, take first)
   *
   * Commands:
   * - ZADD user:{userId}:completed {timestamp} {cycleId} - Add completed cycle
   * - ZREVRANGE user:{userId}:completed 0 0 - Get most recent completed
   * - ZREM user:{userId}:completed {cycleId} - Remove from index
   * - ZCARD user:{userId}:completed - Count completed cycles
   *
   * Sorted Set advantages:
   * - Native descending order with ZREVRANGE (no need for reverse timestamp)
   * - Atomic operations
   * - Efficient range queries
   * - O(log N) insertion and retrieval
   *
   * Implementation note:
   * - Add when cycle is created with Completed status
   * - Add when cycle is completed via completeCycle()
   * - Update score if endDate changes (ZADD overwrites)
   */
  userCompleted: (userId: string) => `user:${userId}:completed`,

  /**
   * Helper: Get timestamp in milliseconds for ZSET score
   */
  timestamp: (date: Date) => date.getTime(),

  /**
   * Helper: Convert timestamp back to Date
   */
  dateFromTimestamp: (timestamp: number) => new Date(timestamp),
} as const;

/**
 * Redis Transaction Patterns using MULTI/EXEC
 *
 * All write operations that involve multiple keys must use MULTI/EXEC
 * to ensure atomicity and consistency.
 */

/**
 * Transaction Pattern 1: Create InProgress Cycle
 *
 * Using WATCH for optimistic locking:
 * 1. WATCH user:{userId}:active
 * 2. GET user:{userId}:active
 *    - If exists: Unwatch and throw CycleAlreadyInProgressError
 * 3. Generate new cycleId
 * 4. MULTI
 * 5. HSET cycle:{cycleId} [all fields]
 * 6. SET user:{userId}:active cycleId
 * 7. EXEC
 *    - If EXEC returns null: transaction aborted (retry or fail)
 */

/**
 * Transaction Pattern 2: Create Completed Cycle
 *
 * No conflict check needed (no active cycle constraint):
 * 1. Generate new cycleId
 * 2. MULTI
 * 3. HSET cycle:{cycleId} [all fields with status=Completed]
 * 4. ZADD user:{userId}:completed {endDate.getTime()} cycleId
 * 5. EXEC
 */

/**
 * Transaction Pattern 3: Complete Cycle
 *
 * Updates cycle status and indexes:
 * 1. HGET cycle:{cycleId} status userId
 *    - If not found or wrong userId: fail
 *    - If status !== 'InProgress': throw CycleInvalidStateError
 * 2. MULTI
 * 3. HSET cycle:{cycleId} status "Completed" startDate {date} endDate {date} updatedAt {now}
 * 4. DEL user:{userId}:active
 * 5. ZADD user:{userId}:completed {endDate.getTime()} cycleId
 * 6. EXEC
 */

/**
 * Transaction Pattern 4: Update Cycle Dates
 *
 * Only updates cycle data, no index changes:
 * 1. HGET cycle:{cycleId} status userId
 *    - If not found or wrong userId: fail
 *    - If status !== 'InProgress': throw CycleInvalidStateError
 * 2. MULTI
 * 3. HSET cycle:{cycleId} startDate {date} endDate {date} updatedAt {now}
 * 4. EXEC
 *
 * Note: No index updates needed since InProgress cycles are not in completed index
 */

/**
 * Query Pattern: Get Last Completed Cycle
 *
 * Using Sorted Set descending order:
 * 1. ZREVRANGE user:{userId}:completed 0 0 - Get highest score (most recent)
 * 2. If empty: return None
 * 3. Extract cycleId from result
 * 4. HGETALL cycle:{cycleId} to retrieve full record
 */

/**
 * Data Validation
 *
 * All data read from Redis should be validated using Effect Schema:
 * - CycleRecordSchema for cycle data from HGETALL
 * - String validation for cycleId references
 * - Date parsing for timestamp fields
 * - Error mapping to CycleRepositoryError
 */

/**
 * Serialization Helpers
 */
export const RedisSerializers = {
  /**
   * Convert CycleRecord to Redis Hash fields
   */
  cycleToHash: (cycle: {
    id: string;
    userId: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Record<string, string> => ({
    id: cycle.id,
    userId: cycle.userId,
    status: cycle.status,
    startDate: cycle.startDate ? cycle.startDate.toISOString() : '',
    endDate: cycle.endDate ? cycle.endDate.toISOString() : '',
    createdAt: cycle.createdAt.toISOString(),
    updatedAt: cycle.updatedAt.toISOString(),
  }),

  /**
   * Convert Redis Hash fields to CycleRecord
   */
  hashToCycle: (hash: Record<string, string>) => ({
    id: hash.id,
    userId: hash.userId,
    status: hash.status,
    startDate: hash.startDate && hash.startDate !== '' ? new Date(hash.startDate) : null,
    endDate: hash.endDate && hash.endDate !== '' ? new Date(hash.endDate) : null,
    createdAt: new Date(hash.createdAt || Date.now()),
    updatedAt: new Date(hash.updatedAt || Date.now()),
  }),
} as const;

export type RedisKeyType = ReturnType<(typeof RedisKeys)[keyof typeof RedisKeys]>;
