import { Effect, Option } from 'effect';
import { PlanRepositoryError } from './errors';
import {
  type PeriodData,
  type PeriodRecord,
  type PeriodStatus,
  type PlanRecord,
  type PlanStatus,
  type PlanWithPeriodsRecord,
} from './schemas';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  PeriodNotFoundError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PeriodOverlapWithCycleError,
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
   * Update the status of a specific period.
   *
   * @param planId - The ID of the plan containing the period
   * @param periodId - The ID of the period to update
   * @param status - The new status
   * @returns Effect that resolves to the updated PeriodRecord
   * @throws PeriodNotFoundError if period doesn't exist or doesn't belong to the plan
   */
  updatePeriodStatus(
    planId: string,
    periodId: string,
    status: PeriodStatus,
  ): Effect.Effect<PeriodRecord, PlanRepositoryError | PeriodNotFoundError>;

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
   * Delete a plan and all its periods (via cascade).
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to delete
   * @returns Effect that resolves to void on successful deletion
   */
  deletePlan(userId: string, planId: string): Effect.Effect<void, PlanRepositoryError>;

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
   * Cancel a plan and optionally preserve fasting history from an in-progress period.
   *
   * This operation is atomic - both the plan cancellation and cycle creation (if applicable)
   * happen in a single transaction. If cycle creation fails, the entire operation is rolled back.
   *
   * Business rules:
   * - Plan must be active (InProgress) to be cancelled
   * - If the plan has an in-progress period, a completed cycle is created to preserve the fasting record
   * - The cycle's startDate = period's startDate, endDate = cancellation time
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to cancel
   * @param inProgressPeriodStartDate - If provided, creates a cycle with this start date and current time as end date
   * @returns Effect that resolves to the cancelled PlanRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not active
   * @throws PlanRepositoryError for database errors (including cycle creation failures)
   */
  cancelPlanWithCyclePreservation(
    userId: string,
    planId: string,
    inProgressPeriodStartDate: Date | null,
  ): Effect.Effect<PlanRecord, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError>;
}
