import { Effect, Option } from 'effect';
import { PlanTemplateRepositoryError } from './errors';
import type { PlanTemplate, PlanTemplateWithPeriods } from '../domain';

export interface IPlanTemplateRepository {
  /**
   * Create a new plan template with period configurations in a single transaction.
   *
   * @param userId - The ID of the user creating the template
   * @param name - The name of the template
   * @param description - Optional description
   * @param periods - Array of period configurations (order, fastingDuration, eatingWindow)
   * @returns Effect that resolves to the created PlanTemplateWithPeriods
   */
  createPlanTemplate(
    userId: string,
    name: string,
    description: string | null,
    periods: ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }>,
  ): Effect.Effect<PlanTemplateWithPeriods, PlanTemplateRepositoryError>;

  /**
   * Retrieve a plan template by its ID and user ID.
   *
   * @param userId - The ID of the user who owns the template
   * @param planTemplateId - The ID of the template to retrieve
   * @returns Effect that resolves to Option<PlanTemplate>
   */
  getPlanTemplateById(
    userId: string,
    planTemplateId: string,
  ): Effect.Effect<Option.Option<PlanTemplate>, PlanTemplateRepositoryError>;

  /**
   * Retrieve a plan template with all its period configurations.
   *
   * @param userId - The ID of the user who owns the template
   * @param planTemplateId - The ID of the template to retrieve
   * @returns Effect that resolves to Option<PlanTemplateWithPeriods>
   */
  getPlanTemplateWithPeriods(
    userId: string,
    planTemplateId: string,
  ): Effect.Effect<Option.Option<PlanTemplateWithPeriods>, PlanTemplateRepositoryError>;

  /**
   * Retrieve all plan templates for a user.
   * Ordered by COALESCE(last_used_at, updated_at) DESC.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to an array of PlanTemplate
   */
  getAllPlanTemplates(userId: string): Effect.Effect<ReadonlyArray<PlanTemplate>, PlanTemplateRepositoryError>;

  /**
   * Count the number of plan templates for a user.
   * Used for limit checks before creation/duplication.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to the count
   */
  countPlanTemplates(userId: string): Effect.Effect<number, PlanTemplateRepositoryError>;

  /**
   * Update a plan template and optionally replace all its period configurations.
   *
   * @param userId - The ID of the user who owns the template
   * @param planTemplateId - The ID of the template to update
   * @param updates - Partial update fields (name, description)
   * @param periods - If provided, replaces ALL period configurations
   * @param now - Optional timestamp for the update
   * @returns Effect that resolves to the updated PlanTemplateWithPeriods
   */
  updatePlanTemplate(
    userId: string,
    planTemplateId: string,
    updates: { name?: string; description?: string | null },
    periods?: ReadonlyArray<{ order: number; fastingDuration: number; eatingWindow: number }>,
    now?: Date,
  ): Effect.Effect<PlanTemplateWithPeriods, PlanTemplateRepositoryError>;

  /**
   * Delete a plan template. Cascade deletes its period configurations.
   *
   * @param userId - The ID of the user who owns the template
   * @param planTemplateId - The ID of the template to delete
   * @returns Effect that resolves to void
   */
  deletePlanTemplate(userId: string, planTemplateId: string): Effect.Effect<void, PlanTemplateRepositoryError>;

  /**
   * Update the last_used_at timestamp to now.
   * Called when a template is applied to create a plan.
   *
   * @param planTemplateId - The ID of the template to touch
   * @param now - Optional timestamp for the update
   * @returns Effect that resolves to void
   */
  touchLastUsedAt(planTemplateId: string, now: Date): Effect.Effect<void, PlanTemplateRepositoryError>;

  /**
   * Delete all plan templates for a user (for account deletion).
   *
   * @param userId - The ID of the user whose templates to delete
   * @returns Effect that resolves to void
   */
  deleteAllByUserId(userId: string): Effect.Effect<void, PlanTemplateRepositoryError>;
}
