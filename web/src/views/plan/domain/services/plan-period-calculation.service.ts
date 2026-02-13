/**
 * Plan Period Calculation Service
 *
 * FUNCTIONAL CORE — Pure date calculation functions (no I/O, no Effect error signaling, deterministic)
 *
 * These functions are the "Core" in Functional Core / Imperative Shell.
 * Exported as standalone pure functions for direct use in web shell
 * (actor guards, composable computeds) and unit testing.
 *
 * Three Phases usage (in PlanApplicationService.createPlan):
 *   1. COLLECTION (Shell — Gateway): —
 *   2. LOGIC (Core):                 calculatePeriodDates computes dates from durations
 *   3. PERSISTENCE (Shell — Gateway): Send payload with calculated dates to API
 *
 * Three Phases usage (in composable — start date change):
 *   1. COLLECTION: Actor context has current periods
 *   2. LOGIC (Core): shiftPeriodDates recomputes dates from new start
 *   3. PERSISTENCE: Composable updates local state (no API call yet)
 */

// ============================================================================
// Standalone Pure Functions
// ============================================================================

const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;

// ============================================================================
// Period Config Operations — for Timeline component period management
//
// These functions compute contiguous scheduling for period configs.
// They return configs WITHOUT IDs — the composable (shell) assigns IDs.
// ============================================================================

/**
 * Input shape for period config operations (startTime + durations, no ID).
 */
interface PeriodConfigInput {
  readonly startTime: Date;
  readonly fastingDuration: number;
  readonly eatingWindow: number;
}

/**
 * Create contiguous period configs from uniform duration params.
 * Periods are contiguous: each starts exactly when the previous ends.
 */
export const createContiguousPeriods = (
  count: number,
  firstStartTime: Date,
  fastingDuration: number,
  eatingWindow: number,
): ReadonlyArray<PeriodConfigInput> => {
  const configs: PeriodConfigInput[] = [];
  let currentStartMs = firstStartTime.getTime();
  const periodDurationMs = hoursToMs(fastingDuration + eatingWindow);

  for (let i = 0; i < count; i++) {
    configs.push({
      startTime: new Date(currentStartMs),
      fastingDuration,
      eatingWindow,
    });
    currentStartMs += periodDurationMs;
  }

  return configs;
};

/**
 * Compute the next contiguous period based on the last period.
 * Preserves the last period's durations.
 */
export const computeNextContiguousPeriod = (lastPeriod: PeriodConfigInput): PeriodConfigInput => {
  const periodDurationMs = hoursToMs(lastPeriod.fastingDuration + lastPeriod.eatingWindow);
  return {
    startTime: new Date(lastPeriod.startTime.getTime() + periodDurationMs),
    fastingDuration: lastPeriod.fastingDuration,
    eatingWindow: lastPeriod.eatingWindow,
  };
};

/**
 * Compute shifted period configs when the base date changes.
 * Preserves IDs and durations — only start times move by the delta.
 * Returns null if dates are equal (no shift needed).
 */
export const computeShiftedPeriodConfigs = (
  configs: ReadonlyArray<PeriodConfigInput & { readonly id: string }>,
  oldDate: Date,
  newDate: Date,
): Array<PeriodConfigInput & { readonly id: string }> | null => {
  const deltaMs = newDate.getTime() - oldDate.getTime();
  if (deltaMs === 0) return null;
  return configs.map((config) => ({
    ...config,
    startTime: new Date(config.startTime.getTime() + deltaMs),
  }));
};
