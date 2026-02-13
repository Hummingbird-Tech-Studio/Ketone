/**
 * Plan Validation Service
 *
 * FUNCTIONAL CORE — Pure validation functions (no I/O, no Effect error signaling, deterministic)
 *
 * These functions are the "Core" in Functional Core / Imperative Shell.
 * They are exported both as standalone functions (for consumers that don't
 * use dependency injection) and wrapped in the PlanValidationService
 * Effect.Service below.
 *
 * Three Phases usage (in PlanApplicationService.saveTimeline):
 *   1. COLLECTION (Shell — Gateway): Load original plan from actor context
 *   2. LOGIC (Core):                 decideSaveTimeline compares original vs current
 *   3. PERSISTENCE (Shell — Gateway): Update metadata and/or periods based on decision
 */
import { Effect } from 'effect';
import {
  type PlanDetail,
  type PlanPeriodUpdate,
  SaveTimelineDecision,
} from '../plan.model';

// ============================================================================
// Standalone Pure Functions
// ============================================================================

/**
 * Check if a start date is valid given the last completed cycle's end date.
 * Pure boolean predicate — 2 outcomes only.
 *
 * A start date is valid if there is no last cycle end date, or
 * the start date is at or after the last cycle's end.
 */
export const isValidStartDate = (startDate: Date, lastCycleEndDate: Date | null): boolean => {
  if (lastCycleEndDate === null) return true;
  return startDate.getTime() >= lastCycleEndDate.getTime();
};

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
  return originalPeriods.some(
    (orig, i) =>
      orig.fastingDuration !== currentPeriods[i].fastingDuration ||
      orig.eatingWindow !== currentPeriods[i].eatingWindow,
  );
};

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
    input.currentStartDate !== undefined &&
    hasStartDateChanged(input.originalPlan.startDate, input.currentStartDate);

  const periodsChanged =
    input.currentPeriods !== undefined &&
    hasPeriodDurationsChanged(input.originalPlan.periods, input.currentPeriods);

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
  isValidStartDate(startDate: Date, lastCycleEndDate: Date | null): boolean;
  hasStartDateChanged(originalStartDate: Date, currentStartDate: Date): boolean;
  hasPeriodDurationsChanged(
    originalPeriods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
    currentPeriods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>,
  ): boolean;
  decideSaveTimeline(input: {
    originalPlan: PlanDetail;
    currentStartDate: Date | undefined;
    currentPeriods: ReadonlyArray<PlanPeriodUpdate> | undefined;
  }): SaveTimelineDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    isValidStartDate,
    hasStartDateChanged,
    hasPeriodDurationsChanged,
    decideSaveTimeline,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
