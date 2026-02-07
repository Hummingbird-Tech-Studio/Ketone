import { Effect, Option } from 'effect';
import { PlanRepositoryError } from './errors';
import { type PeriodData } from './schemas';
import {
  type PlanStatus,
  type PeriodWriteData,
  type Plan,
  type PlanWithPeriods,
  type Period,
  type CycleCreateInput,
  PlanAlreadyActiveError,
  PlanNotFoundError,
  PlanInvalidStateError,
  ActiveCycleExistsError,
  PeriodOverlapWithCycleError,
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
   * This is the Persistence phase of the Three Phases pattern for plan cancellation.
   * All domain validation (status check, period classification, cycle data building)
   * is done by decidePlanCancellation in the Logic phase. This method only handles:
   * 1. Updating the plan status to 'Cancelled' with a concurrency guard
   * 2. Creating cycles for completed and in-progress periods
   * 3. Returning the cancelled Plan
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to cancel
   * @param inProgressPeriodFastingDates - Pre-computed fasting dates for the in-progress period (if any)
   * @param completedPeriodsFastingDates - Pre-computed fasting dates from completed periods
   * @param cancelledAt - The cancellation timestamp from the decision
   * @returns Effect that resolves to the cancelled Plan
   * @throws PlanInvalidStateError if plan was concurrently modified
   * @throws PlanRepositoryError for database errors (including cycle creation failures)
   */
  cancelPlanWithCyclePreservation(
    userId: string,
    planId: string,
    inProgressPeriodFastingDates: { fastingStartDate: Date; fastingEndDate: Date } | null,
    completedPeriodsFastingDates: Array<{ fastingStartDate: Date; fastingEndDate: Date }>,
    cancelledAt: Date,
  ): Effect.Effect<Plan, PlanRepositoryError | PlanInvalidStateError>;

  /**
   * Persist a pre-validated plan completion.
   *
   * This is the Persistence phase of the Three Phases pattern for plan completion.
   * All domain validation (status check, period completion check, cycle data building)
   * is done by decidePlanCompletion in the Logic phase. This method only handles:
   * 1. Creating cycles from the pre-computed cycle data (if any)
   * 2. Updating the plan status to 'Completed' with a concurrency guard
   * 3. Returning the updated Plan
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to complete
   * @param cyclesToCreate - Pre-computed cycle data from decidePlanCompletion
   * @param completedAt - The completion timestamp from the decision
   * @returns Effect that resolves to the completed Plan
   * @throws PlanInvalidStateError if plan was concurrently modified
   * @throws PlanRepositoryError for database errors
   */
  persistPlanCompletion(
    userId: string,
    planId: string,
    cyclesToCreate: ReadonlyArray<CycleCreateInput>,
    completedAt: Date,
  ): Effect.Effect<Plan, PlanRepositoryError | PlanInvalidStateError>;

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
   * Persist a pre-validated metadata update for a plan.
   *
   * This is the Persistence phase of the Three Phases pattern for metadata updates.
   * All domain validation (status check, description normalization, startDate change
   * detection, period recalculation) is done by computeMetadataUpdate in the Logic phase.
   * This method only handles:
   * 1. If recalculatedPeriods is provided: checking overlaps with cycles + updating period rows
   * 2. Updating plan metadata fields
   * 3. Re-fetching periods and returning the updated PlanWithPeriods
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan to update
   * @param planUpdate - Pre-computed plan fields to update
   * @param recalculatedPeriods - Pre-computed recalculated periods (null if no startDate change)
   * @returns Effect that resolves to the updated PlanWithPeriods
   * @throws PeriodOverlapWithCycleError if recalculated periods would overlap with existing cycles
   * @throws PlanRepositoryError for database errors
   */
  persistMetadataUpdate(
    userId: string,
    planId: string,
    planUpdate: {
      readonly name?: string;
      readonly description?: string | null;
      readonly startDate?: Date;
    },
    recalculatedPeriods: ReadonlyArray<{
      readonly id: string;
      readonly startDate: Date;
      readonly endDate: Date;
      readonly fastingStartDate: Date;
      readonly fastingEndDate: Date;
      readonly eatingStartDate: Date;
      readonly eatingEndDate: Date;
    }> | null,
  ): Effect.Effect<PlanWithPeriods, PlanRepositoryError | PeriodOverlapWithCycleError>;
}
