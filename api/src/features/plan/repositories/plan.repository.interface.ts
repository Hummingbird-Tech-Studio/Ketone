import { Effect, Option } from 'effect';
import { PlanRepositoryError } from './errors';
import {
  type PeriodData,
  type PeriodRecord,
  type PeriodUpdateData,
  type PlanRecord,
  type PlanWithPeriodsRecord,
} from './schemas';
import {
  PlanAlreadyActiveError,
  PlanNotFoundError,
  ActiveCycleExistsError,
  InvalidPeriodCountError,
  PlanOverlapError,
} from '../domain';

export interface IPlanRepository {
  /**
   * Create a new plan with its periods in a single transaction.
   *
   * Business rules enforced:
   * - User can only have ONE active plan at a time (partial unique index)
   * - User cannot create a plan if they have an active standalone cycle
   * - Plans must have 1-31 periods
   * - Plan periods cannot overlap with completed fasting cycles (OV-02)
   *
   * @param userId - The ID of the user creating the plan
   * @param startDate - The start date of the plan
   * @param periods - Array of period data (1-31 periods)
   * @returns Effect that resolves to the created PlanWithPeriodsRecord
   * @throws InvalidPeriodCountError if periods array length is not between 1 and 31
   * @throws PlanAlreadyActiveError if user already has an active plan
   * @throws ActiveCycleExistsError if user has an active standalone cycle
   * @throws PlanOverlapError if plan periods overlap with completed fasting cycles
   * @throws PlanRepositoryError for other database errors
   */
  createPlan(
    userId: string,
    startDate: Date,
    periods: PeriodData[],
  ): Effect.Effect<
    PlanWithPeriodsRecord,
    PlanRepositoryError | PlanAlreadyActiveError | ActiveCycleExistsError | InvalidPeriodCountError | PlanOverlapError
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
   * Check if there are any completed cycles that overlap with a given date range.
   *
   * Used for OV-02 validation: periods cannot overlap with completed fasting cycles.
   * Two date ranges overlap if: rangeA.start < rangeB.end AND rangeA.end > rangeB.start
   *
   * @param userId - The ID of the user
   * @param startDate - Start of the range to check
   * @param endDate - End of the range to check
   * @returns Effect that resolves to true if there's an overlap, false otherwise
   */
  hasOverlappingCycles(userId: string, startDate: Date, endDate: Date): Effect.Effect<boolean, PlanRepositoryError>;

  /**
   * Update all periods of a plan in a single transaction.
   *
   * Business rules enforced:
   * - Plan must exist and belong to the user
   * - Updated periods cannot overlap with completed fasting cycles (OV-02)
   *
   * @param userId - The ID of the user who owns the plan
   * @param planId - The ID of the plan containing the periods
   * @param periods - Array of period updates (all periods must be provided)
   * @returns Effect that resolves to the updated PlanWithPeriodsRecord
   * @throws PlanNotFoundError if plan doesn't exist or doesn't belong to user
   * @throws PlanOverlapError if updated periods overlap with completed fasting cycles
   * @throws PlanRepositoryError for other database errors
   */
  updatePeriods(
    userId: string,
    planId: string,
    periods: PeriodUpdateData[],
  ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | PlanNotFoundError | PlanOverlapError>;

  /**
   * Persist a completed or cancelled plan from cache to PostgreSQL.
   *
   * Used when a plan is completed or cancelled to persist it permanently.
   * Creates the plan and all its periods in a single transaction.
   *
   * @param plan - The complete plan with periods to persist
   * @returns Effect that resolves to the persisted PlanWithPeriodsRecord
   * @throws PlanAlreadyActiveError if user already has an active plan in database
   * @throws PlanRepositoryError for database errors
   */
  persistCompletedPlan(
    plan: PlanWithPeriodsRecord,
  ): Effect.Effect<PlanWithPeriodsRecord, PlanRepositoryError | PlanAlreadyActiveError>;
}
