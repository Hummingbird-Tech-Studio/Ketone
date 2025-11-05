/**
 * LMDB Key Schema for Cycle Storage
 *
 * This file documents the key structure and indexing strategy for storing
 * cycle data in LMDB. LMDB is a key-value store, so we need to design
 * our keys carefully to support all required queries efficiently.
 *
 * Key Design Principles:
 * 1. Primary keys for direct access
 * 2. Secondary indexes for queries
 * 3. Sorted keys for range queries
 * 4. Composite keys for multi-field queries
 */

/**
 * Key Types and Their Purposes
 */
export const LmdbKeys = {
  /**
   * PRIMARY STORE: Complete cycle data
   * Key: `cycle:{cycleId}`
   * Value: Complete CycleRecord object (JSON)
   *
   * Example: "cycle:123e4567-e89b-12d3-a456-426614174000"
   *
   * Used by:
   * - getCycleById()
   * - All operations that need full cycle data after getting cycleId from index
   */
  cycle: (cycleId: string) => `cycle:${cycleId}`,

  /**
   * INDEX: Active cycle for a user
   * Key: `user:{userId}:active`
   * Value: cycleId (string) or null if no active cycle
   *
   * Example: "user:abc123:active" → "cycle123"
   *
   * Used by:
   * - getActiveCycle()
   * - Enforces business rule: only ONE active cycle per user
   *
   * Implementation note:
   * - When creating InProgress cycle: SET this key
   * - When completing cycle: DELETE this key
   * - Before creating InProgress: CHECK if this key exists (atomic operation)
   */
  userActive: (userId: string) => `user:${userId}:active`,

  /**
   * INDEX: Completed cycles ordered by endDate (descending)
   * Key: `user:{userId}:completed:{reverseTimestamp}:{cycleId}`
   * Value: cycleId (string)
   *
   * Example: "user:abc123:completed:8640000000000:cycle123"
   *
   * Reverse timestamp explanation:
   * - To get DESC order in LMDB (which sorts keys ascending)
   * - reverseTimestamp = (Number.MAX_SAFE_INTEGER - endDate.getTime())
   * - This makes newer cycles appear first when scanning
   *
   * Used by:
   * - getLastCompletedCycle() - scan and take first result
   *
   * Implementation note:
   * - Add this key when cycle is created with Completed status
   * - Add this key when cycle is completed via completeCycle()
   * - Update if cycle dates change (rare, but possible)
   */
  userCompleted: (userId: string, reverseTimestamp: number, cycleId: string) =>
    `user:${userId}:completed:${reverseTimestamp}:${cycleId}`,

  /**
   * Helper: Get reverse timestamp for descending order
   */
  reverseTimestamp: (date: Date) => Number.MAX_SAFE_INTEGER - date.getTime(),

  /**
   * Helper: Get original timestamp from reverse timestamp
   */
  originalTimestamp: (reverseTimestamp: number) => Number.MAX_SAFE_INTEGER - reverseTimestamp,
} as const;

/**
 * LMDB Transaction Patterns
 *
 * All write operations must use transactions to ensure atomicity and consistency.
 */

/**
 * Transaction Pattern 1: Create InProgress Cycle
 *
 * Steps:
 * 1. BEGIN transaction
 * 2. CHECK if user:{userId}:active exists
 *    - If exists: ROLLBACK and throw CycleAlreadyInProgressError
 * 3. Generate new cycleId
 * 4. PUT cycle:{cycleId} = cycleRecord
 * 5. PUT user:{userId}:active = cycleId
 * 6. COMMIT transaction
 */

/**
 * Transaction Pattern 2: Create Completed Cycle
 *
 * Steps:
 * 1. BEGIN transaction
 * 2. Generate new cycleId
 * 3. PUT cycle:{cycleId} = cycleRecord
 * 4. Calculate reverseTimestamp from endDate
 * 5. PUT user:{userId}:completed:{reverseTimestamp}:{cycleId} = cycleId
 * 6. COMMIT transaction
 */

/**
 * Transaction Pattern 3: Complete Cycle
 *
 * Steps:
 * 1. BEGIN transaction
 * 2. GET cycle:{cycleId}
 *    - If not found or wrong userId: ROLLBACK and fail
 *    - If status !== 'InProgress': ROLLBACK and throw CycleInvalidStateError
 * 3. UPDATE cycle:{cycleId} with new status and dates
 * 4. DELETE user:{userId}:active
 * 5. Calculate reverseTimestamp from new endDate
 * 6. PUT user:{userId}:completed:{reverseTimestamp}:{cycleId} = cycleId
 * 7. COMMIT transaction
 */

/**
 * Transaction Pattern 4: Update Cycle Dates
 *
 * Steps:
 * 1. BEGIN transaction
 * 2. GET cycle:{cycleId}
 *    - If not found or wrong userId: ROLLBACK and fail
 *    - If status !== 'InProgress': ROLLBACK and throw CycleInvalidStateError
 * 3. UPDATE cycle:{cycleId} with new dates
 * 4. COMMIT transaction
 *
 * Note: No index updates needed since InProgress cycles are not in completed index
 */

/**
 * Query Pattern: Get Last Completed Cycle
 *
 * Steps:
 * 1. Create key range: user:{userId}:completed:
 * 2. Scan keys starting from prefix
 * 3. Take first result (lowest reverseTimestamp = highest actual timestamp)
 * 4. Extract cycleId from key
 * 5. GET cycle:{cycleId} to retrieve full record
 */

/**
 * Data Validation
 *
 * All data read from LMDB should be validated using Effect Schema:
 * - CycleRecordSchema for cycle data
 * - String validation for cycleId references
 * - Error mapping to CycleRepositoryError
 */

export type LmdbKeyType = ReturnType<(typeof LmdbKeys)[keyof typeof LmdbKeys]>;
