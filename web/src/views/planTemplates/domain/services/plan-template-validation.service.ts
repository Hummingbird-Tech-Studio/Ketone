/**
 * PlanTemplate Validation Service
 *
 * FUNCTIONAL CORE — Pure functions (no I/O, no Effect error signaling, deterministic)
 *
 * These functions are the "Core" in Functional Core / Imperative Shell.
 * Three Phases pattern:
 *   - Collection: Actor loads template count from API client (Shell)
 *   - Logic: decideSaveTemplateLimit checks count vs cap (Core — THIS FILE)
 *   - Persistence: Actor calls API client to create/duplicate (Shell)
 *
 * Exported both as standalone functions (for direct use and testing)
 * and wrapped in an Effect.Service for dependency injection.
 */
import { Effect } from 'effect';
import { SaveTemplateLimitDecision } from '../contracts';

// ============================================================================
// Standalone Pure Functions
// ============================================================================

/**
 * Check if the user has reached the template limit.
 * Pure boolean predicate — 2 outcomes only.
 */
export const isTemplateLimitReached = (currentCount: number, maxTemplates: number): boolean =>
  currentCount >= maxTemplates;

/**
 * Decide whether a save/duplicate operation can proceed.
 * Returns a SaveTemplateLimitDecision ADT — for 2+ variant branching in actors.
 */
export const decideSaveTemplateLimit = (input: {
  currentCount: number;
  maxTemplates: number;
}): SaveTemplateLimitDecision => {
  if (isTemplateLimitReached(input.currentCount, input.maxTemplates)) {
    return SaveTemplateLimitDecision.LimitReached({
      currentCount: input.currentCount,
      maxTemplates: input.maxTemplates,
    });
  }

  return SaveTemplateLimitDecision.CanSave();
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanTemplateValidationService {
  decideSaveTemplateLimit(input: { currentCount: number; maxTemplates: number }): SaveTemplateLimitDecision;
}

export class PlanTemplateValidationService extends Effect.Service<PlanTemplateValidationService>()(
  'PlanTemplateValidationService',
  {
    effect: Effect.succeed({
      decideSaveTemplateLimit,
    } satisfies IPlanTemplateValidationService),
    accessors: true,
  },
) {}
