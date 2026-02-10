/**
 * PlanTemplate Presentation Functions
 *
 * UI formatting and display-ordering helpers extracted from the domain layer.
 * These produce user-facing strings and sort for display — not domain logic.
 */
import type { PlanTemplateSummary } from '../domain';

/**
 * Format a period count for card display.
 * e.g., 1 → "1 period", 5 → "5 periods"
 */
export const formatPeriodCountLabel = (count: number): string => (count === 1 ? '1 period' : `${count} periods`);

/**
 * Build the delete confirmation message with the template name.
 * Spec copy: "Are you sure you want to delete '[Plan Name]'? This can't be undone."
 */
export const buildDeleteConfirmationMessage = (name: string): string =>
  `Are you sure you want to delete '${name}'? This can't be undone.`;

/**
 * Sort templates by most recently updated first (descending updatedAt).
 * Spec: "most recently modified or used (most recent first)"
 */
export const sortTemplatesByRecency = (
  templates: ReadonlyArray<PlanTemplateSummary>,
): ReadonlyArray<PlanTemplateSummary> => [...templates].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

/**
 * Format the limit-reached toast message.
 * Spec copy: "You have N saved plans—that's the limit! To save a new one, delete a plan you no longer use."
 */
export const formatLimitReachedMessage = (maxTemplates: number): string =>
  `You have ${maxTemplates} saved plans\u2014that's the limit! To save a new one, delete a plan you no longer use.`;
