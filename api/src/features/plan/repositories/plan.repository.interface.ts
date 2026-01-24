import { Effect, Option } from 'effect';
import { PlanRepositoryError } from './errors';
import {
  type PeriodData,
  type PeriodRecord,
  type PlanRecord,
  type PlanStatus,
  type PlanWithPeriodsRecord,
} from './schemas';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PeriodOverlapWithCycleError,
  PeriodsMismatchError,
  PeriodNotInPlanError,
  PeriodsNotCompletedError,
} from '../domain';

export interface IPlanRepository {
  /**
   * Create a new plan with its periods in a single transaction.
   *
   * Business rules enforced:
   * - User can only have ONE active plan at a time (partial unique index)
   * - User cannot create a plan if they have an active standalone cycle
   * - Plans must have 1-31 periods
   * - Plan periods cannot overlap with existing cycles (OV-02)
   *
   * @param userId - The ID of the user creating the plan
   * @param startDate - The start date of the plan
   * @param periods - Array of period data (1-31 periods)
   * @param name - The name of the plan (required)
   * @param description - Optional description of the plan
   * @returns Effect that resolves to the created PlanWithPeriodsRecord
   * @throws InvalidPeriodCountError if periods array length is not between 1 and 31
   * @throws PlanAlreadyActiveError if user already has an active plan
   * @throws ActiveCycleExistsError if user has an active standalone cycle
   * @throws PeriodOverlapWithCycleError if any period overlaps with an existing cycle
   * @throws PlanRepositoryError for other database errors
   */
  createPlan(
    userId: string,
    startDate: Date,
    periods: PeriodData[],
    name: string,
    description?: string,
  ): Effect.Effect<
    PlanWithPeriodsRecord,
    | PlanRepositoryError
    | PlanAlreadyActiveError
    | ActiveCycleExistsError
    | InvalidPeriodCountError
    | PeriodOverlapWithCycleError
  >;

  /**
   * Retrieve a plan by its ID and user ID.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to retrieve
   * @returns Effect that resolves to Option<PlanRecord> - Some if found, None if not found
   */
  getPlanById(userId: string, planId: string): Effect.Effect<Option.Option<PlanRecord>, PlanRepositoryError>;

  /**
   * Retrieve a plan with all its periods.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to retrieve
   * @returns Effect that resolves to Option<PlanWithPeriodsRecord>
   */
  getPlanWithPeriods(
    userId: string,
    planId: string,
  ): Effect.Effect<Option.Option<PlanWithPeriodsRecord>, PlanRepositoryError>;

  /**
   * Retrieve the active plan for a user.
   *
   * Business rule: A user can only have ONE active plan at a time.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<PlanRecord> - Some if user has active plan, None otherwise
   */
  getActivePlan(userId: string): Effect.Effect<Option.Option<PlanRecord>, PlanRepositoryError>;

  /**
   * Retrieve the active plan with all its periods.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<PlanWithPeriodsRecord>
   */
  getActivePlanWithPeriods(userId: string): Effect.Effect<Option.Option<PlanWithPeriodsRecord>, PlanRepositoryError>;

  /**
   * Update the status of a plan.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param status - The new status ('Completed' or 'Cancelled')
   * @returns Effect that resolves to the updated PlanRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not in a valid state for the transition
   */
  updatePlanStatus(
    userId: string,
    planId: string,
    status: PlanStatus,
  ): Effect.Effect<PlanRecord, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError>;

  /**
   * Retrieve all periods for a plan, ordered by their order field.
   *
   * @param planId - The ID of the plan
   * @returns Effect that resolves to an array of PeriodRecord, ordered by order ascending
   */
  getPlanPeriods(planId: string): Effect.Effect<PeriodRecord[], PlanRepositoryError>;

  /**
   * Check if user has an active plan OR an active standalone cycle.
   *
   * Used for validation before creating a new plan.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to { hasActivePlan: boolean, hasActiveCycle: boolean }
   */
  hasActivePlanOrCycle(
    userId: string,
  ): Effect.Effect<{ hasActivePlan: boolean; hasActiveCycle: boolean }, PlanRepositoryError>;

  /**
   * Delete all plans for a user (for account deletion).
   *
   * @param userId - The ID of the user whose plans to delete
   * @returns Effect that resolves to void on successful deletion
   */
  deleteAllByUserId(userId: string): Effect.Effect<void, PlanRepositoryError>;

  /**
   * Get all plans for a user, ordered by startDate descending.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to an array of PlanRecord
   */
  getAllPlans(userId: string): Effect.Effect<PlanRecord[], PlanRepositoryError>;

  /**
   * Cancel a plan and preserve fasting history from completed and in-progress periods.
   *
   * This operation is atomic - both the plan cancellation and cycle creation (if applicable)
   * happen in a single transaction. If cycle creation fails, the entire operation is rolled back.
   *
   * Business rules:
   * - Plan must be active (InProgress) to be cancelled
   * - Completed periods create cycles with their full fasting dates
   * - If the plan has an in-progress period, a completed cycle is created to preserve the fasting record:
   *   - If cancelled during fasting: startDate = fastingStartDate, endDate = cancellation time
   *   - If cancelled during eating window: startDate = fastingStartDate, endDate = fastingEndDate
   * - Scheduled (future) periods are not preserved
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to cancel
   * @param inProgressPeriodFastingDates - If provided, the fasting dates used to create the cycle for in-progress period
   * @param completedPeriodsFastingDates - Array of fasting dates from completed periods to create cycles for
   * @returns Effect that resolves to the cancelled PlanRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not active
   * @throws PlanRepositoryError for database errors (including cycle creation failures)
   */
  cancelPlanWithCyclePreservation(
    userId: string,
    planId: string,
    inProgressPeriodFastingDates: { fastingStartDate: Date; fastingEndDate: Date } | null,
    completedPeriodsFastingDates: Array<{ fastingStartDate: Date; fastingEndDate: Date }>,
  ): Effect.Effect<PlanRecord, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError>;

  /**
   * Complete a plan atomically with validation.
   *
   * This operation is atomic - all validations and the status update happen in a single transaction.
   *
   * Business rules (PC-01):
   * - Plan must exist and belong to the user
   * - Plan must be in InProgress state
   * - All periods must be in 'completed' status
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to complete
   * @returns Effect that resolves to the completed PlanRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not in InProgress state
   * @throws PeriodsNotCompletedError if not all periods are in 'completed' status
   * @throws PlanRepositoryError for database errors
   */
  completePlanWithValidation(
    userId: string,
    planId: string,
  ): Effect.Effect<
    PlanRecord,
    PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PeriodsNotCompletedError
  >;

  /**
   * Update periods of a plan with new durations.
   *
   * Business rules:
   * - ED-01: Periods can be edited at any time
   * - ED-02: Completed periods can also be edited
   * - ED-03: When editing a period, subsequent periods shift to maintain contiguity
   * - ED-04: Edits cannot cause overlap with existing completed cycles
   * - ED-05: Fasting duration 1-168 hours, eating window 1-24 hours
   * - IM-01: Periods cannot be deleted (count must match)
   * - IM-02: Periods are always contiguous
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param periods - Array of period updates with id, fastingDuration, and eatingWindow
   * @returns Effect that resolves to the updated PlanWithPeriodsRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PeriodsMismatchError if the number of periods doesn't match
   * @throws PeriodNotInPlanError if any period ID doesn't belong to the plan
   * @throws PeriodOverlapWithCycleError if updated periods would overlap with existing cycles
   * @throws PlanRepositoryError for database errors
   */
  updatePlanPeriods(
    userId: string,
    planId: string,
    periods: Array<{ id: string; fastingDuration: number; eatingWindow: number }>,
  ): Effect.Effect<
    PlanWithPeriodsRecord,
    PlanRepositoryError | PlanNotFoundError | PeriodsMismatchError | PeriodNotInPlanError | PeriodOverlapWithCycleError
  >;
}
