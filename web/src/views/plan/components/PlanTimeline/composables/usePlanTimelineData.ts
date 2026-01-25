import type { AdjacentCycle } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import type { CompletedCycleBar, PeriodConfig, TimelineBar } from '../types';

interface UsePlanTimelineDataOptions {
  periodConfigs: Ref<PeriodConfig[]>;
  lastCompletedCycle: Ref<AdjacentCycle | null>;
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

// Maximum time (in milliseconds) before the first period that a completed cycle should be visible
const MAX_CYCLE_VISIBILITY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function usePlanTimelineData(options: UsePlanTimelineDataOptions) {
  // Get the earliest start time from all non-deleted periods
  const periodEarliestStartTime = computed(() => {
    const nonDeletedConfigs = options.periodConfigs.value.filter((c) => !c.deleted);
    if (nonDeletedConfigs.length === 0) return new Date();

    return nonDeletedConfigs.reduce((earliest, config) => {
      return config.startTime < earliest ? config.startTime : earliest;
    }, nonDeletedConfigs[0]!.startTime);
  });

  // Check if the completed cycle should be visible (within 3 days of first period start)
  const isCompletedCycleVisible = computed(() => {
    const cycle = options.lastCompletedCycle.value;
    if (!cycle) return false;

    const periodStart = periodEarliestStartTime.value;
    const cycleEnd = cycle.endDate;

    // Cycle is visible if its end date is within 3 days before the first period start
    const timeDiff = periodStart.getTime() - cycleEnd.getTime();
    return timeDiff <= MAX_CYCLE_VISIBILITY_MS;
  });

  // Timeline start time includes the completed cycle only if it's visible
  const timelineStartTime = computed(() => {
    const periodStart = periodEarliestStartTime.value;
    const cycle = options.lastCompletedCycle.value;

    if (!cycle || !isCompletedCycleVisible.value) return periodStart;

    // Include the completed cycle start if it's earlier and visible
    return cycle.startDate < periodStart ? cycle.startDate : periodStart;
  });

  // Calculate the end time of the last period (latest end time)
  const lastPeriodEndTime = computed(() => {
    const nonDeletedConfigs = options.periodConfigs.value.filter((c) => !c.deleted);
    if (nonDeletedConfigs.length === 0) return new Date();

    return nonDeletedConfigs.reduce((latest, config) => {
      const periodEnd = addHoursToDate(config.startTime, config.fastingDuration + config.eatingWindow);
      return periodEnd > latest ? periodEnd : latest;
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

  const timelineBars = computed<TimelineBar[]>(() => {
    const bars: TimelineBar[] = [];
    const startTime = new Date(timelineStartTime.value);
    const endTimeLimit = lastPeriodEndTime.value.getTime();

    // Generate bars for each period based on its individual config
    options.periodConfigs.value.forEach((config, periodIndex) => {
      // Skip deleted periods
      if (config.deleted) return;

      const periodStart = new Date(config.startTime);
      const fastingEnd = addHoursToDate(periodStart, config.fastingDuration);
      const eatingEnd = addHoursToDate(fastingEnd, config.eatingWindow);

      // Split fasting period across days
      addBarsForTimeRange(bars, periodIndex, periodStart, fastingEnd, 'fasting', startTime, endTimeLimit);

      // Split eating period across days
      if (config.eatingWindow > 0) {
        addBarsForTimeRange(bars, periodIndex, fastingEnd, eatingEnd, 'eating', startTime, endTimeLimit);
      }
    });

    return bars;
  });

  // Helper function to add bars for a time range, splitting across days
  function addBarsForTimeRange(
    bars: TimelineBar[],
    periodIndex: number,
    rangeStart: Date,
    rangeEnd: Date,
    type: 'fasting' | 'eating',
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
        });
      }

      // Move to next day
      currentStart = dayEnd;
    }
  }

  // Compute completed cycle bars (split by day like period bars)
  // Only compute if the cycle is visible (within 3 days of first period start)
  const completedCycleBars = computed<CompletedCycleBar[]>(() => {
    const cycle = options.lastCompletedCycle.value;
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

      const dayIndex = Math.floor((dayStart.getTime() - timelineStartDay.getTime()) / (1000 * 60 * 60 * 24));

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

  return {
    numRows,
    dayLabels,
    hourLabels,
    hourPositions,
    timelineBars,
    completedCycleBars,
    timelineStartTime,
  };
}
