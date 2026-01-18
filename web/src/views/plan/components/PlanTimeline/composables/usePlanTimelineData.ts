import { computed, type Ref } from 'vue';
import type { GapInfo, PeriodConfig, TimelineBar } from '../types';

interface UsePlanTimelineDataOptions {
  periodConfigs: Ref<PeriodConfig[]>;
}

export function usePlanTimelineData(options: UsePlanTimelineDataOptions) {
  // Get the earliest start time from all non-deleted periods
  const timelineStartTime = computed(() => {
    const nonDeletedConfigs = options.periodConfigs.value.filter((c) => !c.deleted);
    if (nonDeletedConfigs.length === 0) return new Date();

    return nonDeletedConfigs.reduce((earliest, config) => {
      return config.startTime < earliest ? config.startTime : earliest;
    }, nonDeletedConfigs[0]!.startTime);
  });

  // Calculate the end time of the last period (latest end time)
  const lastPeriodEndTime = computed(() => {
    const nonDeletedConfigs = options.periodConfigs.value.filter((c) => !c.deleted);
    if (nonDeletedConfigs.length === 0) return new Date();

    return nonDeletedConfigs.reduce((latest, config) => {
      const periodEnd = new Date(config.startTime);
      periodEnd.setHours(periodEnd.getHours() + config.fastingDuration + config.eatingWindow);
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

    // Collect non-deleted period indices for gap calculation
    const nonDeletedIndices: number[] = [];

    // Generate bars for each period based on its individual config
    options.periodConfigs.value.forEach((config, periodIndex) => {
      // Skip deleted periods
      if (config.deleted) return;

      nonDeletedIndices.push(periodIndex);

      const periodStart = new Date(config.startTime);

      const fastingEnd = new Date(periodStart);
      fastingEnd.setHours(fastingEnd.getHours() + config.fastingDuration);

      const eatingEnd = new Date(fastingEnd);
      eatingEnd.setHours(eatingEnd.getHours() + config.eatingWindow);

      // Split fasting period across days
      addBarsForTimeRange(bars, periodIndex, periodStart, fastingEnd, 'fasting', startTime, endTimeLimit);

      // Split eating period across days
      if (config.eatingWindow > 0) {
        addBarsForTimeRange(bars, periodIndex, fastingEnd, eatingEnd, 'eating', startTime, endTimeLimit);
      }
    });

    // Generate gap bars between consecutive non-deleted periods
    for (let i = 0; i < nonDeletedIndices.length - 1; i++) {
      const currentPeriodIndex = nonDeletedIndices[i]!;
      const nextPeriodIndex = nonDeletedIndices[i + 1]!;

      const currentConfig = options.periodConfigs.value[currentPeriodIndex]!;
      const nextConfig = options.periodConfigs.value[nextPeriodIndex]!;

      // Calculate current period end time
      const currentEndTime = new Date(currentConfig.startTime);
      currentEndTime.setHours(
        currentEndTime.getHours() + currentConfig.fastingDuration + currentConfig.eatingWindow,
      );

      // Calculate gap duration in milliseconds
      const gapMs = nextConfig.startTime.getTime() - currentEndTime.getTime();

      // Only create gap bar if there's actually a gap (> 0 hours)
      if (gapMs > 0) {
        const gapInfo: GapInfo = {
          afterPeriodIndex: currentPeriodIndex,
          beforePeriodIndex: nextPeriodIndex,
        };

        addGapBarsForTimeRange(bars, currentEndTime, nextConfig.startTime, startTime, endTimeLimit, gapInfo);
      }
    }

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

  // Helper function to add gap bars for a time range, splitting across days
  function addGapBarsForTimeRange(
    bars: TimelineBar[],
    gapStart: Date,
    gapEnd: Date,
    timelineStart: Date,
    endTimeLimit: number,
    gapInfo: GapInfo,
  ) {
    const timelineStartDay = new Date(timelineStart);
    timelineStartDay.setHours(0, 0, 0, 0);

    let currentStart = new Date(gapStart);

    while (currentStart < gapEnd && currentStart.getTime() <= endTimeLimit) {
      const dayStart = new Date(currentStart);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const barStart = currentStart;
      const barEnd = new Date(Math.min(gapEnd.getTime(), dayEnd.getTime()));

      const dayIndex = Math.floor((dayStart.getTime() - timelineStartDay.getTime()) / (1000 * 60 * 60 * 24));

      const startHour = (barStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const endHour = (barEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60);
      const segmentDurationHours = Math.round(endHour - startHour);

      if (segmentDurationHours > 0 && dayIndex >= 0) {
        bars.push({
          periodIndex: -1, // Use -1 to indicate this is not a real period
          dayIndex,
          startHour,
          endHour,
          duration: `${segmentDurationHours}h`, // Show segment duration, not total
          type: 'gap',
          gapInfo,
        });
      }

      // Move to next day
      currentStart = dayEnd;
    }
  }

  return {
    numRows,
    dayLabels,
    hourLabels,
    hourPositions,
    timelineBars,
    timelineStartTime,
  };
}
