import { Effect, Option } from 'effect';
import { PlanRepositoryError } from './errors';
import { type PeriodData } from './schemas';
import {
  type PlanStatus,
  type PeriodWriteData,
  type Plan,
  type PlanWithPeriods,
  type Period,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  PeriodOverlapWithCycleError,
  PeriodsNotCompletedError,
} from '../domain';

export interface IPlanRepository {
  /**
   * Create a new plan with its periods in a single transaction.
   *
   * Business rules enforced:
   * - User can only have ONE active plan at a time (partial unique index)
   * - User cannot create a plan if they have an active standalone cycle (DB exclusion constraint)
   * - Plan periods cannot overlap with existing cycles (OV-02)
   *
   * Note: Period count validation is handled in the Logic phase (decidePlanCreation).
   *
   * @param userId - The ID of the user creating the plan
   * @param startDate - The start date of the plan
   * @param periods - Array of period data
   * @param name - The name of the plan (required)
   * @param description - Optional description of the plan
   * @returns Effect that resolves to the created PlanWithPeriods
   * @throws PlanAlreadyActiveError if user already has an active plan
   * @throws ActiveCycleExistsError if user has an active standalone cycle (DB constraint)
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
    PlanWithPeriods,
    PlanRepositoryError | PlanAlreadyActiveError | ActiveCycleExistsError | PeriodOverlapWithCycleError
  >;

  /**
   * Retrieve a plan by its ID and user ID.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to retrieve
   * @returns Effect that resolves to Option<Plan> - Some if found, None if not found
   */
  getPlanById(userId: string, planId: string): Effect.Effect<Option.Option<Plan>, PlanRepositoryError>;

  /**
   * Retrieve a plan with all its periods.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to retrieve
   * @returns Effect that resolves to Option<PlanWithPeriods>
   */
  getPlanWithPeriods(
    userId: string,
    planId: string,
  ): Effect.Effect<Option.Option<PlanWithPeriods>, PlanRepositoryError>;

  /**
   * Retrieve the active plan for a user.
   *
   * Business rule: A user can only have ONE active plan at a time.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<Plan> - Some if user has active plan, None otherwise
   */
  getActivePlan(userId: string): Effect.Effect<Option.Option<Plan>, PlanRepositoryError>;

  /**
   * Retrieve the active plan with all its periods.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to Option<PlanWithPeriods>
   */
  getActivePlanWithPeriods(userId: string): Effect.Effect<Option.Option<PlanWithPeriods>, PlanRepositoryError>;

  /**
   * Update the status of a plan.
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param status - The new status ('Completed' or 'Cancelled')
   * @returns Effect that resolves to the updated Plan
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not in a valid state for the transition
   */
  updatePlanStatus(
    userId: string,
    planId: string,
    status: PlanStatus,
  ): Effect.Effect<Plan, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError>;

  /**
   * Retrieve all periods for a plan, ordered by their order field.
   *
   * @param planId - The ID of the plan
   * @returns Effect that resolves to an array of Period, ordered by order ascending
   */
  getPlanPeriods(planId: string): Effect.Effect<Period[], PlanRepositoryError>;

  /**
   * Check if user has an active plan OR an active standalone cycle.
   *
   * Used for validation before creating a new plan.
   * Returns the IDs of active plan/cycle if they exist, or null if not.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to { activePlanId: string | null, activeCycleId: string | null }
   */
  hasActivePlanOrCycle(
    userId: string,
  ): Effect.Effect<{ activePlanId: string | null; activeCycleId: string | null }, PlanRepositoryError>;

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
   * @returns Effect that resolves to an array of Plan
   */
  getAllPlans(userId: string): Effect.Effect<Plan[], PlanRepositoryError>;

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
   * @param now - Current time (injected from Clock for testability)
   * @returns Effect that resolves to the cancelled Plan
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not active
   * @throws PlanRepositoryError for database errors (including cycle creation failures)
   */
  cancelPlanWithCyclePreservation(
    userId: string,
    planId: string,
    inProgressPeriodFastingDates: { fastingStartDate: Date; fastingEndDate: Date } | null,
    completedPeriodsFastingDates: Array<{ fastingStartDate: Date; fastingEndDate: Date }>,
    now: Date,
  ): Effect.Effect<Plan, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError>;

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
   * @param now - Current time (injected from Clock for testability)
   * @returns Effect that resolves to the completed Plan
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not in InProgress state
   * @throws PeriodsNotCompletedError if not all periods are in 'completed' status
   * @throws PlanRepositoryError for database errors
   */
  completePlanWithValidation(
    userId: string,
    planId: string,
    now: Date,
  ): Effect.Effect<Plan, PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PeriodsNotCompletedError>;

  /**
   * Persist pre-validated period data for a plan.
   *
   * This is the Persistence phase of the Three Phases pattern for period updates.
   * All domain validation (period count, duplicate IDs, ID ownership, date calculation)
   * is done by decidePeriodUpdate in the Logic phase. This method only handles:
   * 1. Checking overlaps with existing cycles (requires DB access)
   * 2. Deleting all existing periods for the plan
   * 3. Inserting new periods (preserving IDs where non-null)
   * 4. Returning the updated plan with periods
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param periodsToWrite - Pre-computed period data from decidePeriodUpdate
   * @returns Effect that resolves to the updated PlanWithPeriods
   * @throws PeriodOverlapWithCycleError if periods would overlap with existing cycles
   * @throws PlanRepositoryError for database errors
   */
  persistPeriodUpdate(
    userId: string,
    planId: string,
    periodsToWrite: ReadonlyArray<PeriodWriteData>,
  ): Effect.Effect<PlanWithPeriods, PlanRepositoryError | PeriodOverlapWithCycleError>;

  /**
   * Update plan metadata (name, description, startDate).
   *
   * Business rules:
   * - Only active plans (InProgress) can be edited
   * - If startDate changes, all periods are recalculated to maintain contiguity
   * - Recalculated periods cannot overlap with existing cycles
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param metadata - Object containing optional name, description, and startDate
   * @returns Effect that resolves to the updated PlanWithPeriods
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanInvalidStateError if plan is not in InProgress state
   * @throws PeriodOverlapWithCycleError if recalculated periods would overlap with existing cycles
   * @throws PlanRepositoryError for database errors
   */
  updatePlanMetadata(
    userId: string,
    planId: string,
    metadata: {
      name?: string;
      description?: string;
      startDate?: Date;
    },
  ): Effect.Effect<
    PlanWithPeriods,
    PlanRepositoryError | PlanNotFoundError | PlanInvalidStateError | PeriodOverlapWithCycleError
  >;
}
