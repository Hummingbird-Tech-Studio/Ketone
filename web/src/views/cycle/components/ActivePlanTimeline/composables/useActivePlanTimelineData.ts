import type { PeriodResponse, PeriodStatus } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import type { ActivePlanTimelineBar } from '../types';

interface UseActivePlanTimelineDataOptions {
  periods: Ref<readonly PeriodResponse[]>;
  currentPeriodId: Ref<string | null>;
  currentTime: Ref<Date>;
}

/**
 * Helper to ensure a value is a Date object
 */
function ensureDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

/**
 * Helper to add fractional hours to a date (supports 30-minute increments)
 */
function addHoursToDate(date: Date, hours: number): Date {
  const newDate = new Date(date);
  const millisToAdd = hours * 60 * 60 * 1000;
  newDate.setTime(newDate.getTime() + millisToAdd);
  return newDate;
}

export function useActivePlanTimelineData(options: UseActivePlanTimelineDataOptions) {
  // Get the earliest start time from all periods
  const timelineStartTime = computed(() => {
    const periods = options.periods.value;
    if (periods.length === 0) return new Date();

    return periods.reduce((earliest, period) => {
      const startDate = ensureDate(period.startDate);
      return startDate < earliest ? startDate : earliest;
    }, ensureDate(periods[0]!.startDate));
  });

  // Calculate the end time of the last period (latest end time)
  const lastPeriodEndTime = computed(() => {
    const periods = options.periods.value;
    if (periods.length === 0) return new Date();

    return periods.reduce((latest, period) => {
      const endDate = ensureDate(period.endDate);
      return endDate > latest ? endDate : latest;
    }, new Date(0));
  });

  // Calculate number of days needed to show all periods
  const numRows = computed(() => {
    const startDay = new Date(timelineStartTime.value);
    startDay.setHours(0, 0, 0, 0);

    const endDay = new Date(lastPeriodEndTime.value);
    endDay.setHours(0, 0, 0, 0);

    const daysDiff = Math.ceil((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff + 1;
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

  // Helper function to add bars for a time range, splitting across days
  function addBarsForTimeRange(
    bars: ActivePlanTimelineBar[],
    periodIndex: number,
    rangeStart: Date,
    rangeEnd: Date,
    type: 'fasting' | 'eating',
    periodStatus: PeriodStatus,
    timelineStart: Date,
    endTimeLimit: number,
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

      const dayIndex = Math.floor((dayStart.getTime() - timelineStartDay.getTime()) / (1000 * 60 * 60 * 24));

      const startHour = (barStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const endHour = (barEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const durationHours = Math.round(endHour - startHour);

      if (durationHours > 0 && dayIndex >= 0) {
        bars.push({
          periodIndex,
          dayIndex,
          startHour,
          endHour,
          duration: `${durationHours}h`,
          type,
          periodStatus,
        });
      }

      // Move to next day
      currentStart = dayEnd;
    }
  }

  const timelineBars = computed<ActivePlanTimelineBar[]>(() => {
    const bars: ActivePlanTimelineBar[] = [];
    const periods = options.periods.value;
    const startTime = new Date(timelineStartTime.value);
    const endTimeLimit = lastPeriodEndTime.value.getTime();

    // Generate bars for each period based on its individual config
    periods.forEach((period, periodIndex) => {
      const periodStart = ensureDate(period.fastingStartDate);
      const fastingEnd = ensureDate(period.fastingEndDate);
      const eatingEnd = ensureDate(period.eatingEndDate);

      // Split fasting period across days
      addBarsForTimeRange(bars, periodIndex, periodStart, fastingEnd, 'fasting', period.status, startTime, endTimeLimit);

      // Split eating period across days
      const eatingDuration = period.eatingWindow;
      if (eatingDuration > 0) {
        addBarsForTimeRange(bars, periodIndex, fastingEnd, eatingEnd, 'eating', period.status, startTime, endTimeLimit);
      }
    });

    return bars;
  });

  // Calculate current time position for the marker
  // Returns { dayIndex, hourPosition } for placing the marker on the timeline
  const currentTimePosition = computed(() => {
    const now = options.currentTime.value;
    const periods = options.periods.value;

    if (periods.length === 0) {
      return null;
    }

    // Find an active period - either by ID or by finding one that's currently in progress
    let activePeriod = options.currentPeriodId.value
      ? periods.find((p) => p.id === options.currentPeriodId.value)
      : null;

    // If no period found by ID, find one by status or time
    if (!activePeriod) {
      activePeriod = periods.find((p) => p.status === 'in_progress');
    }

    // If still no period, find one where current time falls within its range
    if (!activePeriod) {
      activePeriod = periods.find((p) => {
        const fastingStart = ensureDate(p.fastingStartDate);
        const eatingEnd = ensureDate(p.eatingEndDate);
        return now >= fastingStart && now <= eatingEnd;
      });
    }

    if (!activePeriod) {
      return null;
    }

    // Check if we're within the fasting or eating window
    const fastingStart = ensureDate(activePeriod.fastingStartDate);
    const fastingEnd = ensureDate(activePeriod.fastingEndDate);
    const eatingEnd = ensureDate(activePeriod.eatingEndDate);

    if (now < fastingStart || now > eatingEnd) {
      return null;
    }

    // Calculate the day index and hour position
    const startDay = new Date(timelineStartTime.value);
    startDay.setHours(0, 0, 0, 0);

    const currentDay = new Date(now);
    currentDay.setHours(0, 0, 0, 0);

    const dayIndex = Math.floor((currentDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
    const hourPosition = (now.getTime() - currentDay.getTime()) / (1000 * 60 * 60);

    // Determine if we're in fasting or eating window
    const isInFasting = now >= fastingStart && now < fastingEnd;

    return {
      dayIndex,
      hourPosition,
      isInFasting,
    };
  });

  return {
    numRows,
    dayLabels,
    hourLabels,
    hourPositions,
    timelineBars,
    timelineStartTime,
    currentTimePosition,
  };
}
