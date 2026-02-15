/**
 * FUNCTIONAL CORE — Plan Validation Service
 *
 * Pure validation functions (no I/O, no Effect error signaling, deterministic).
 * Exported as standalone functions for direct use in composables/actors,
 * and wrapped in PlanValidationService Effect.Service for Application Service DI.
 *
 * Consumers:
 *   - usePlanEditForm (composable):        hasStartDateChanged, hasPeriodDurationsChanged
 *   - useTemplateEditForm (composable):     hasPeriodDurationsChanged
 *   - usePeriodManager (composable):        canAddPeriod, canRemovePeriod
 *   - PlanApplicationService (via DI):      decideSaveTimeline
 */
import { Effect } from 'effect';
import { SaveTimelineDecision } from '../contracts';
import { MAX_PERIODS, MIN_PERIODS, type PlanDetail, type PlanPeriodUpdate } from '../plan.model';

// ============================================================================
// Standalone Pure Functions
// ============================================================================

/**
 * Determine whether the start date changed between original and current.
 */
export const hasStartDateChanged = (originalStartDate: Date, currentStartDate: Date): boolean =>
  originalStartDate.getTime() !== currentStartDate.getTime();

/**
 * Determine whether period durations changed between original and current.
 * Compares fasting durations and eating windows by position.
 */
export const hasPeriodDurationsChanged = (
  originalPeriods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
  currentPeriods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
): boolean => {
  if (originalPeriods.length !== currentPeriods.length) return true;
  return originalPeriods.some((orig, i) => {
    const current = currentPeriods[i]!;
    return orig.fastingDuration !== current.fastingDuration || orig.eatingWindow !== current.eatingWindow;
  });
};

/**
 * Check if a new period can be added given the current count.
 * Pure boolean predicate — delegates to MAX_PERIODS constant.
 */
export const canAddPeriod = (currentCount: number): boolean => currentCount < MAX_PERIODS;

/**
 * Check if a period can be removed given the current count.
 * Pure boolean predicate — delegates to MIN_PERIODS constant.
 */
export const canRemovePeriod = (currentCount: number): boolean => currentCount > MIN_PERIODS;

/**
 * Decide what changed in the timeline and what API calls are needed.
 * Returns a SaveTimelineDecision ADT — for 4-variant branching in actors.
 *
 * - NoChanges: nothing to save
 * - OnlyStartDate: only start date changed → update metadata
 * - OnlyPeriods: only period durations changed → update periods
 * - StartDateAndPeriods: both changed → update metadata then periods (sequential)
 */
export const decideSaveTimeline = (input: {
  originalPlan: PlanDetail;
  currentStartDate: Date | undefined;
  currentPeriods: ReadonlyArray<PlanPeriodUpdate> | undefined;
}): SaveTimelineDecision => {
  const startDateChanged =
    input.currentStartDate !== undefined && hasStartDateChanged(input.originalPlan.startDate, input.currentStartDate);

  const periodsChanged =
    input.currentPeriods !== undefined && hasPeriodDurationsChanged(input.originalPlan.periods, input.currentPeriods);

  if (startDateChanged && periodsChanged) {
    return SaveTimelineDecision.StartDateAndPeriods({
      startDate: input.currentStartDate!,
      periods: input.currentPeriods!,
    });
  }

  if (startDateChanged) {
    return SaveTimelineDecision.OnlyStartDate({
      startDate: input.currentStartDate!,
    });
  }

  if (periodsChanged) {
    return SaveTimelineDecision.OnlyPeriods({
      periods: input.currentPeriods!,
    });
  }

  return SaveTimelineDecision.NoChanges();
};

// ============================================================================
// Effect.Service — Wraps pure core functions for dependency injection
// ============================================================================

export interface IPlanValidationService {
  decideSaveTimeline(input: {
    originalPlan: PlanDetail;
    currentStartDate: Date | undefined;
    currentPeriods: ReadonlyArray<PlanPeriodUpdate> | undefined;
  }): SaveTimelineDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    decideSaveTimeline,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
