import { Effect, Option } from 'effect';
import { CycleRepositoryError } from './errors';
import { CycleInvalidStateError, CycleAlreadyInProgressError } from '../domain';
import { type CycleData, type CycleRecord } from './schemas';

export interface ICycleRepository {
  /**
   * Retrieve a cycle by its ID and user ID.
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to retrieve
   * @returns Effect that resolves to Option<CycleRecord> - Some if found, None if not found
   */
  getCycleById(userId: string, cycleId: string): Effect.Effect<Option.Option<CycleRecord>, CycleRepositoryError>;

  /**
   * Retrieve the active (InProgress) cycle for a user from PostgreSQL.
   *
   * Business rule: A user can only have ONE active cycle at a time.
   * This constraint is enforced by the partial unique index: idx_cycles_user_active
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<CycleRecord> - Some if user has active cycle, None otherwise
   */
  getActiveCycle(userId: string): Effect.Effect<Option.Option<CycleRecord>, CycleRepositoryError>;

  /**
   * Retrieve the last completed cycle for a user, ordered by endDate descending.
   *
   * Used for overlap validation when creating new cycles.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<CycleRecord> - Some if user has completed cycles, None otherwise
   */
  getLastCompletedCycle(userId: string): Effect.Effect<Option.Option<CycleRecord>, CycleRepositoryError>;

  /**
   * Retrieve the previous completed cycle relative to a reference start date.
   *
   * Used for CycleDetail validation to check overlap with previous cycle.
   * Returns the cycle with startDate closest to (but before) the reference start date.
   *
   * @param userId - The ID of the user
   * @param cycleId - The ID of the current cycle (to exclude from search)
   * @param referenceStartDate - The start date of the current cycle
   * @returns Effect that resolves to Option<CycleRecord> - Some if a previous cycle exists, None otherwise
   */
  getPreviousCycle(
    userId: string,
    cycleId: string,
    referenceStartDate: Date,
  ): Effect.Effect<Option.Option<CycleRecord>, CycleRepositoryError>;

  /**
   * Retrieve the next cycle relative to a reference start date.
   *
   * Used for CycleDetail validation to check overlap with next cycle.
   * Returns the cycle with startDate closest to (but after) the reference start date.
   * Includes both Completed and InProgress cycles.
   *
   * @param userId - The ID of the user
   * @param cycleId - The ID of the current cycle (to exclude from search)
   * @param referenceStartDate - The start date of the current cycle
   * @returns Effect that resolves to Option<CycleRecord> - Some if a next cycle exists, None otherwise
   */
  getNextCycle(
    userId: string,
    cycleId: string,
    referenceStartDate: Date,
  ): Effect.Effect<Option.Option<CycleRecord>, CycleRepositoryError>;

  /**
   * Create a new cycle in PostgreSQL.
   *
   * Business rule enforcement:
   * - If creating an InProgress cycle, must fail if user already has an active cycle
   * - The partial unique index (idx_cycles_user_active) enforces the "one InProgress cycle per user" constraint
   *
   * @param data - The cycle data to create
   * @returns Effect that resolves to the created CycleRecord
   * @throws CycleAlreadyInProgressError if user already has an active cycle (constraint violation)
   * @throws CycleRepositoryError for other database errors
   */
  createCycle(data: CycleData): Effect.Effect<CycleRecord, CycleRepositoryError | CycleAlreadyInProgressError>;

  /**
   * Update the dates of an existing cycle.
   *
   * Business rule: Only cycles with status 'InProgress' can have their dates updated.
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to update
   * @param startDate - The new start date
   * @param endDate - The new end date
   * @returns Effect that resolves to the updated CycleRecord
   * @throws CycleInvalidStateError if cycle is not in InProgress state
   * @throws CycleRepositoryError for other database errors
   */
  updateCycleDates(
    userId: string,
    cycleId: string,
    startDate: Date,
    endDate: Date,
  ): Effect.Effect<CycleRecord, CycleRepositoryError | CycleInvalidStateError>;

  /**
   * Complete a cycle by updating its status from 'InProgress' to 'Completed' in PostgreSQL.
   *
   * This method UPDATEs an existing InProgress cycle in PostgreSQL.
   * The cycle must already exist in PostgreSQL with status='InProgress'.
   *
   * The CycleService is responsible for:
   * 1. Validating the cycle from KeyValueStore
   * 2. Calling this method to update it in PostgreSQL to 'Completed'
   * 3. Removing it from KeyValueStore
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to complete
   * @param startDate - The final start date
   * @param endDate - The final end date
   * @returns Effect that resolves to the completed CycleRecord
   * @throws CycleInvalidStateError if cycle is not in InProgress state or doesn't exist
   * @throws CycleRepositoryError for other database errors
   */
  completeCycle(
    userId: string,
    cycleId: string,
    startDate: Date,
    endDate: Date,
  ): Effect.Effect<CycleRecord, CycleRepositoryError | CycleInvalidStateError>;

  /**
   * Update the dates of an already completed cycle.
   *
   * Business rule: Only cycles with status 'Completed' can be updated with this method.
   * This is different from updateCycleDates which only works on InProgress cycles.
   *
   * Use case: User editing historical completed cycles from the cycle detail page.
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to update
   * @param startDate - The new start date
   * @param endDate - The new end date
   * @returns Effect that resolves to the updated CycleRecord
   * @throws CycleInvalidStateError if cycle is not in Completed state
   * @throws CycleRepositoryError for other database errors
   */
  updateCompletedCycleDates(
    userId: string,
    cycleId: string,
    startDate: Date,
    endDate: Date,
  ): Effect.Effect<CycleRecord, CycleRepositoryError | CycleInvalidStateError>;

  /**
   * Delete a cycle from PostgreSQL.
   *
   * This is primarily used for rollback operations when cycle creation fails
   * after the cycle has been inserted into PostgreSQL but before it's added to KVStore.
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to delete
   * @returns Effect that resolves to void on successful deletion
   * @throws CycleRepositoryError for database errors
   */
  deleteCycle(userId: string, cycleId: string): Effect.Effect<void, CycleRepositoryError>;

  /**
   * Delete all cycles for a user from PostgreSQL.
   *
   * Used for account deletion to remove all user data.
   *
   * @param userId - The ID of the user whose cycles to delete
   * @returns Effect that resolves to void on successful deletion
   * @throws CycleRepositoryError for database errors
   */
  deleteAllByUserId(userId: string): Effect.Effect<void, CycleRepositoryError>;

  /**
   * Retrieve cycles within a date period based on their startDate.
   *
   * Used for statistics and historical data retrieval.
   * A cycle belongs to a period if its startDate falls within [periodStart, periodEnd].
   *
   * @param userId - The ID of the user
   * @param periodStart - The start of the period (inclusive)
   * @param periodEnd - The end of the period (inclusive)
   * @returns Effect that resolves to an array of CycleRecord, ordered by startDate descending
   * @throws CycleRepositoryError for database errors
   */
  getCyclesByPeriod(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Effect.Effect<CycleRecord[], CycleRepositoryError>;
}
