/**
 * Plan Presentation Functions
 *
 * UI formatting and display-ordering helpers extracted from the domain layer.
 * These produce user-facing strings and sort for display — not domain logic.
 */

// ============================================================================
// Blocking Resource Messages
// ============================================================================

/**
 * The type of blocking resource that prevents plan creation.
 */
export type BlockingResourceType = 'cycle' | 'plan';

/**
 * Format the title for the blocking resource dialog.
 * Spec copy: "Cycle In Progress" / "Plan In Progress"
 */
export const formatBlockingResourceTitle = (type: BlockingResourceType): string =>
  type === 'cycle' ? 'Cycle In Progress' : 'Plan In Progress';

/**
 * Format the message for the blocking resource dialog.
 * Spec copy:
 *   cycle: "You have an active fasting cycle. In order to start a new plan, you first need to finish your current cycle."
 *   plan:  "You have an active plan in progress. In order to start a new plan, you first need to complete or end your current one."
 */
export const formatBlockingResourceMessage = (type: BlockingResourceType): string =>
  type === 'cycle'
    ? 'You have an active fasting cycle. In order to start a new plan, you first need to finish your current cycle.'
    : 'You have an active plan in progress. In order to start a new plan, you first need to complete or end your current one.';

// ============================================================================
// Period Count
// ============================================================================

/**
 * Format a period count for display.
 * e.g., 1 → "1 period", 5 → "5 periods"
 */
export const formatPeriodCountLabel = (count: number): string => (count === 1 ? '1 period' : `${count} periods`);
