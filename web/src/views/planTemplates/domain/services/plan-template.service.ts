/**
 * PlanTemplate Domain Service
 *
 * FUNCTIONAL CORE — Pure functions (no I/O, no Effect error signaling, deterministic)
 *
 * These functions are the "Core" in Functional Core / Imperative Shell.
 * Three Phases pattern:
 *   - Collection: Actor/gateway fetches templates (Shell)
 *   - Logic: formatPeriodCountLabel, buildDuplicateName, etc. (Core — THIS FILE)
 *   - Persistence: Actor/gateway persists changes (Shell)
 *
 * Exported both as standalone functions (for direct use and testing)
 * and wrapped in an Effect.Service for dependency injection.
 */
import { Effect } from 'effect';
import {
  MAX_PLAN_NAME_LENGTH,
  type PlanName,
  PlanName as PlanNameBrand,
  type PlanTemplateSummary,
} from '../plan-template.model';

// ============================================================================
// Standalone Pure Functions
// ============================================================================

/**
 * Build a duplicate name by appending " (copy)" to the original name.
 * Truncates the base name if the result would exceed MAX_PLAN_NAME_LENGTH.
 */
export const buildDuplicateName = (name: PlanName): PlanName => {
  const suffix = ' (copy)';
  const maxBase = MAX_PLAN_NAME_LENGTH - suffix.length;
  const base = name.length > maxBase ? name.slice(0, maxBase) : name;
  return PlanNameBrand(`${base}${suffix}`);
};

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

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanTemplateDomainService {
  buildDuplicateName(name: PlanName): PlanName;
  formatPeriodCountLabel(count: number): string;
  buildDeleteConfirmationMessage(name: string): string;
  sortTemplatesByRecency(templates: ReadonlyArray<PlanTemplateSummary>): ReadonlyArray<PlanTemplateSummary>;
  formatLimitReachedMessage(maxTemplates: number): string;
}

export class PlanTemplateDomainService extends Effect.Service<PlanTemplateDomainService>()(
  'PlanTemplateDomainService',
  {
    effect: Effect.succeed({
      buildDuplicateName,
      formatPeriodCountLabel,
      buildDeleteConfirmationMessage,
      sortTemplatesByRecency,
      formatLimitReachedMessage,
    } satisfies IPlanTemplateDomainService),
    accessors: true,
  },
) {}
