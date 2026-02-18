import type { AdjacentCycle, PeriodResponse } from '@ketone/shared';
import { differenceInCalendarDays } from 'date-fns';
import { computed, type Ref } from 'vue';
import { MAX_CYCLE_VISIBILITY_MS } from '../constants';
import type {
  CompletedCycleBar,
  CurrentTimePosition,
  PeriodConfig,
  PeriodState,
  TimelineBar,
  TimelineMode,
} from '../types';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Helper to add fractional hours to a date (supports 15-minute increments)
 */
export function addHoursToDate(date: Date, hours: number): Date {
  const newDate = new Date(date);
  const millisToAdd = hours * 60 * 60 * 1000;
  newDate.setTime(newDate.getTime() + millisToAdd);
  return newDate;
}

/**
 * Format duration in hours to "Xh" or "Xh Ym" format.
 * Handles floating point precision issues (e.g., 2.9999... should be 3h, not 2h 60m)
 */
export function formatDuration(hours: number): string {
  // Round to nearest minute to avoid floating point issues
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Determine the state of a bar based on current time and phase boundaries.
 * For fasting bars: scheduled -> in_progress -> completed based on fasting times
 * For eating bars: state is based on eating window times in view mode, always 'scheduled' in edit mode
 */
function getBarState(
  barType: 'fasting' | 'eating',
  phaseStart: Date,
  phaseEnd: Date,
  now: Date,
  mode: TimelineMode,
): PeriodState {
  // In edit mode, eating windows don't show progress states
  if (mode === 'edit' && barType === 'eating') {
    return 'scheduled';
  }

  // For both modes with fasting bars, and view mode with eating bars
  if (now < phaseStart) {
    return 'scheduled';
  }
  if (now >= phaseStart && now < phaseEnd) {
    return 'in_progress';
  }
  return 'completed';
}

// ============================================================================
// Interfaces
// ============================================================================

interface UseTimelineDataOptions {
  mode: TimelineMode;
  // View mode data
  periods?: Ref<readonly PeriodResponse[]>;
  currentPeriodId?: Ref<string | null>;
  // Edit mode data
  periodConfigs?: Ref<PeriodConfig[]>;
  completedCycle?: Ref<AdjacentCycle | null>;
  // Shared
  currentTime: Ref<Date>;
}

// ============================================================================
// Main Composable
// ============================================================================

export function useTimelineData(options: UseTimelineDataOptions) {
  const { mode, currentTime } = options;

  // ========================================
  // Normalized Data Access
  // ========================================

  // Get the earliest start time from all periods
  const periodEarliestStartTime = computed(() => {
    if (mode === 'view' && options.periods) {
      const periods = options.periods.value;
      if (periods.length === 0) return new Date();
      return periods.reduce((earliest, period) => {
        return period.startDate < earliest ? period.startDate : earliest;
      }, periods[0]!.startDate);
    } else if (mode === 'edit' && options.periodConfigs) {
      const configs = options.periodConfigs.value;
      if (configs.length === 0) return new Date();
      return configs.reduce((earliest, config) => {
        return config.startTime < earliest ? config.startTime : earliest;
      }, configs[0]!.startTime);
    }
    return new Date();
  });

  // Get the end time of the last period (latest end time)
  const lastPeriodEndTime = computed(() => {
    if (mode === 'view' && options.periods) {
      const periods = options.periods.value;
      if (periods.length === 0) return new Date();
      return periods.reduce((latest, period) => {
        return period.endDate > latest ? period.endDate : latest;
      }, new Date(0));
    } else if (mode === 'edit' && options.periodConfigs) {
      const configs = options.periodConfigs.value;
      if (configs.length === 0) return new Date();
      return configs.reduce((latest, config) => {
        const periodEnd = addHoursToDate(config.startTime, config.fastingDuration + config.eatingWindow);
        return periodEnd > latest ? periodEnd : latest;
      }, new Date(0));
    }
    return new Date();
  });

  // ========================================
  // Completed Cycle Logic (Edit Mode Only)
  // ========================================

  // Check if the completed cycle should be visible (within 3 days of first period start)
  const isCompletedCycleVisible = computed(() => {
    if (mode !== 'edit' || !options.completedCycle) return false;
    const cycle = options.completedCycle.value;
    if (!cycle) return false;

    const periodStart = periodEarliestStartTime.value;
    const cycleEnd = cycle.endDate;

    // Cycle is visible if its end date is within 3 days before the first period start
    const timeDiff = periodStart.getTime() - cycleEnd.getTime();
    return timeDiff <= MAX_CYCLE_VISIBILITY_MS;
  });

  // Timeline start time includes the completed cycle only if it's visible
  const timelineStartTime = computed(() => {
    if (mode === 'view') {
      return periodEarliestStartTime.value;
    }

    // Edit mode - may include completed cycle
    const periodStart = periodEarliestStartTime.value;
    const cycle = options.completedCycle?.value;

    if (!cycle || !isCompletedCycleVisible.value) return periodStart;

    // Include the completed cycle start if it's earlier and visible
    return cycle.startDate < periodStart ? cycle.startDate : periodStart;
  });

  // ========================================
  // Row and Label Calculations
  // ========================================

  // Calculate number of days needed to show all periods
  const numRows = computed(() => {
    return differenceInCalendarDays(lastPeriodEndTime.value, timelineStartTime.value) + 1;
  });

  const dayLabels = computed(() => {
    const labels: string[] = [];
    const startTime = new Date(timelineStartTime.value);

    for (let i = 0; i < numRows.value; i++) {
      const currentDate = new Date(startTime);
      currentDate.setDate(startTime.getDate() + i);

      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = currentDate.getDate().toString();
      labels.push(`${dayName}\n${dayNum}`);
    }

    return labels;
  });

  const hourLabels = computed(() => ['12AM', '6AM', '12PM', '6PM']);
  const hourPositions = computed(() => [0, 6, 12, 18]);

  // ========================================
  // Bar Generation
  // ========================================

  // Helper function to add bars for a time range, splitting across days
  function addBarsForTimeRange(
    bars: TimelineBar[],
    periodIndex: number,
    rangeStart: Date,
    rangeEnd: Date,
    type: 'fasting' | 'eating',
    timelineStart: Date,
    endTimeLimit: number,
    now: Date,
    periodState: PeriodState,
  ) {
    const timelineStartDay = new Date(timelineStart);
    timelineStartDay.setHours(0, 0, 0, 0);

    let currentStart = new Date(rangeStart);

    while (currentStart < rangeEnd && currentStart.getTime() <= endTimeLimit) {
      const dayStart = new Date(currentStart);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const barStart = currentStart;
      const barEnd = new Date(Math.min(rangeEnd.getTime(), dayEnd.getTime()));

      const dayIndex = differenceInCalendarDays(dayStart, timelineStartDay);

      const startHour = (barStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const endHour = (barEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const durationHours = endHour - startHour;

      if (durationHours > 0 && dayIndex >= 0) {
        bars.push({
          periodIndex,
          dayIndex,
          startHour,
          endHour,
          duration: formatDuration(durationHours),
          type,
          periodState,
        });
      }

      // Move to next day
      currentStart = dayEnd;
    }
  }

  const timelineBars = computed<TimelineBar[]>(() => {
    const bars: TimelineBar[] = [];
    const startTime = new Date(timelineStartTime.value);
    const endTimeLimit = lastPeriodEndTime.value.getTime();
    const now = currentTime.value;

    if (mode === 'view' && options.periods) {
      // View mode - use PeriodResponse data
      const periods = options.periods.value;
      periods.forEach((period, periodIndex) => {
        // Calculate state for fasting phase
        const fastingState = getBarState('fasting', period.fastingStartDate, period.fastingEndDate, now, mode);
        // Calculate state for eating phase
        const eatingState = getBarState('eating', period.fastingEndDate, period.eatingEndDate, now, mode);

        // Split fasting period across days
        addBarsForTimeRange(
          bars,
          periodIndex,
          period.fastingStartDate,
          period.fastingEndDate,
          'fasting',
          startTime,
          endTimeLimit,
          now,
          fastingState,
        );

        // Split eating period across days
        if (period.eatingWindow > 0) {
          addBarsForTimeRange(
            bars,
            periodIndex,
            period.fastingEndDate,
            period.eatingEndDate,
            'eating',
            startTime,
            endTimeLimit,
            now,
            eatingState,
          );
        }
      });
    } else if (mode === 'edit' && options.periodConfigs) {
      // Edit mode - use PeriodConfig data
      const configs = options.periodConfigs.value;
      configs.forEach((config, periodIndex) => {
        const periodStart = new Date(config.startTime);
        const fastingEnd = addHoursToDate(periodStart, config.fastingDuration);
        const eatingEnd = addHoursToDate(fastingEnd, config.eatingWindow);

        // Calculate state for fasting phase
        const fastingState = getBarState('fasting', periodStart, fastingEnd, now, mode);
        // Calculate state for eating phase (always 'scheduled' in edit mode)
        const eatingState = getBarState('eating', fastingEnd, eatingEnd, now, mode);

        // Split fasting period across days
        addBarsForTimeRange(
          bars,
          periodIndex,
          periodStart,
          fastingEnd,
          'fasting',
          startTime,
          endTimeLimit,
          now,
          fastingState,
        );

        // Split eating period across days
        if (config.eatingWindow > 0) {
          addBarsForTimeRange(
            bars,
            periodIndex,
            fastingEnd,
            eatingEnd,
            'eating',
            startTime,
            endTimeLimit,
            now,
            eatingState,
          );
        }
      });
    }

    return bars;
  });

  // ========================================
  // Completed Cycle Bars (Edit Mode Only)
  // ========================================

  const completedCycleBars = computed<CompletedCycleBar[]>(() => {
    if (mode !== 'edit' || !options.completedCycle) return [];

    const cycle = options.completedCycle.value;
    if (!cycle || !isCompletedCycleVisible.value) return [];

    const bars: CompletedCycleBar[] = [];
    const startTime = new Date(timelineStartTime.value);
    const timelineStartDay = new Date(startTime);
    timelineStartDay.setHours(0, 0, 0, 0);

    const rangeStart = cycle.startDate;
    const rangeEnd = cycle.endDate;

    // Determine if the cycle spans multiple days (weak spanning)
    const startDay = new Date(rangeStart);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(rangeEnd);
    endDay.setHours(0, 0, 0, 0);
    const isWeakSpanning = startDay.getTime() !== endDay.getTime();

    // Calculate total cycle duration for tooltip
    const totalDurationMs = rangeEnd.getTime() - rangeStart.getTime();
    const totalDurationHours = Math.floor(totalDurationMs / (1000 * 60 * 60));
    const totalDurationMinutes = Math.floor((totalDurationMs % (1000 * 60 * 60)) / (1000 * 60));
    const totalDurationStr =
      totalDurationMinutes > 0 ? `${totalDurationHours}h ${totalDurationMinutes}m` : `${totalDurationHours}h`;

    let currentStart = new Date(rangeStart);

    while (currentStart < rangeEnd) {
      const dayStart = new Date(currentStart);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const barStart = currentStart;
      const barEnd = new Date(Math.min(rangeEnd.getTime(), dayEnd.getTime()));

      const dayIndex = differenceInCalendarDays(dayStart, timelineStartDay);

      const startHour = (barStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const endHour = (barEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);

      // Calculate segment duration for this bar
      const segmentDurationMs = barEnd.getTime() - barStart.getTime();
      const segmentHours = Math.floor(segmentDurationMs / (1000 * 60 * 60));
      const segmentMinutes = Math.floor((segmentDurationMs % (1000 * 60 * 60)) / (1000 * 60));
      const segmentDurationStr = segmentMinutes > 0 ? `${segmentHours}h ${segmentMinutes}m` : `${segmentHours}h`;

      if (endHour - startHour > 0 && dayIndex >= 0) {
        bars.push({
          dayIndex,
          startHour,
          endHour,
          segmentDuration: segmentDurationStr,
          totalDuration: totalDurationStr,
          startDate: rangeStart,
          endDate: rangeEnd,
          isWeakSpanning,
        });
      }

      // Move to next day
      currentStart = dayEnd;
    }

    return bars;
  });

  // ========================================
  // Current Time Position
  // ========================================

  const currentTimePosition = computed<CurrentTimePosition | null>(() => {
    const now = currentTime.value;

    // Helper to calculate day index and hour position
    const calculatePosition = () => {
      const startDay = new Date(timelineStartTime.value);
      startDay.setHours(0, 0, 0, 0);

      const currentDay = new Date(now);
      currentDay.setHours(0, 0, 0, 0);

      const dayIndex = differenceInCalendarDays(currentDay, startDay);
      const hourPosition = (now.getTime() - currentDay.getTime()) / (1000 * 60 * 60);

      return { dayIndex, hourPosition };
    };

    if (mode === 'view' && options.periods) {
      const periods = options.periods.value;
      if (periods.length === 0) return null;

      // Find an active period - either by ID or by finding one that's currently in progress
      let activePeriod = options.currentPeriodId?.value
        ? periods.find((p) => p.id === options.currentPeriodId!.value)
        : null;

      // If no period found by ID, find one where current time falls within its range
      if (!activePeriod) {
        activePeriod = periods.find((p) => {
          return now >= p.fastingStartDate && now <= p.eatingEndDate;
        });
      }

      // If we found a period by ID but we're before its fasting start,
      // we're in "waiting for plan to start" state
      if (activePeriod && now < activePeriod.fastingStartDate) {
        const { dayIndex, hourPosition } = calculatePosition();
        return {
          dayIndex,
          hourPosition,
          isInFasting: false,
          isWaiting: true,
        };
      }

      // If still no active period, check if we're waiting for plan to start
      if (!activePeriod) {
        const sortedPeriods = [...periods].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        const firstPeriod = sortedPeriods[0];
        if (firstPeriod && now < firstPeriod.fastingStartDate) {
          const { dayIndex, hourPosition } = calculatePosition();
          return {
            dayIndex,
            hourPosition,
            isInFasting: false,
            isWaiting: true,
          };
        }
        return null;
      }

      // Check if we're past the eating window end
      if (now > activePeriod.eatingEndDate) {
        return null;
      }

      // Calculate position for active fasting/eating window
      const { dayIndex, hourPosition } = calculatePosition();

      // Determine if we're in fasting or eating window
      const isInFasting = now >= activePeriod.fastingStartDate && now < activePeriod.fastingEndDate;

      return {
        dayIndex,
        hourPosition,
        isInFasting,
        isWaiting: false,
      };
    } else if (mode === 'edit' && options.periodConfigs) {
      const configs = options.periodConfigs.value;
      if (configs.length === 0) return null;

      // Get timeline bounds
      const endTime = lastPeriodEndTime.value;

      // Only hide marker if current time is past the timeline end
      if (now > endTime) {
        return null;
      }

      const { dayIndex, hourPosition } = calculatePosition();

      // Ensure dayIndex is within valid range
      // Allow dayIndex 0 even if now is before the first period (marker shows on first day)
      if (dayIndex < 0 || dayIndex >= numRows.value) {
        return null;
      }

      return { dayIndex, hourPosition };
    }

    return null;
  });

  // ========================================
  // Period Progress (Edit Mode Only)
  // ========================================

  // Calculate completed periods count based on current time
  const completedPeriodsCount = computed(() => {
    if (mode !== 'edit' || !options.periodConfigs) return 0;

    const now = currentTime.value;
    const configs = options.periodConfigs.value;

    let count = 0;
    for (const config of configs) {
      const fastingEnd = addHoursToDate(config.startTime, config.fastingDuration);
      if (now >= fastingEnd) {
        count++;
      }
    }
    return count;
  });

  // Calculate current period index (0-based, or -1 if before first period)
  const currentPeriodIndex = computed(() => {
    if (mode !== 'edit' || !options.periodConfigs) return 0;

    const now = currentTime.value;
    const configs = options.periodConfigs.value;

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i]!;
      const periodEnd = addHoursToDate(config.startTime, config.fastingDuration + config.eatingWindow);

      // If we're before this period ends, this is the current period
      if (now < periodEnd) {
        return i;
      }
    }

    // All periods completed
    return configs.length - 1;
  });

  return {
    numRows,
    dayLabels,
    hourLabels,
    hourPositions,
    timelineBars,
    completedCycleBars,
    timelineStartTime,
    currentTimePosition,
    completedPeriodsCount,
    currentPeriodIndex,
    isCompletedCycleVisible,
  };
}
