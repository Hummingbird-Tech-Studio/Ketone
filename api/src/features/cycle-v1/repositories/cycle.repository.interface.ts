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
   * Retrieve the active (InProgress) cycle for a user.
   *
   * Business rule: A user can only have ONE active cycle at a time.
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
   * Create a new cycle.
   *
   * Business rule enforcement:
   * - If creating an InProgress cycle, must fail if user already has an active cycle
   *
   * @param data - The cycle data to create
   * @returns Effect that resolves to the created CycleRecord
   * @throws CycleAlreadyInProgressError if user already has an active cycle
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
   * Complete a cycle by setting its status to 'Completed' and updating its dates.
   *
   * Business rule: Only cycles with status 'InProgress' can be completed.
   *
   * @param userId - The ID of the user who owns the cycle
   * @param cycleId - The ID of the cycle to complete
   * @param startDate - The final start date
   * @param endDate - The final end date
   * @returns Effect that resolves to the completed CycleRecord
   * @throws CycleInvalidStateError if cycle is not in InProgress state
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
}
