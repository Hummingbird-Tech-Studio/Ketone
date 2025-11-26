import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import { formatDuration } from '@/utils';
import type { GanttBar } from '../types';
import { MS_PER_MINUTE } from './chart/constants';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NUM_COLUMNS = 7;

interface UseWeeklyChartDataProps {
  cycles: Ref<readonly CycleStatisticsItem[]>;
  periodStart: Ref<Date | undefined>;
  periodEnd: Ref<Date | undefined>;
}

export function useWeeklyChartData(props: UseWeeklyChartDataProps) {
  const chartTitle = computed(() => 'Week Statistics');

  const dateRange = computed(() => {
    if (!props.periodStart.value || !props.periodEnd.value) return '';

    const start = props.periodStart.value;
    const end = props.periodEnd.value;

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  });

  const numColumns = computed(() => NUM_COLUMNS);

  const dayLabels = computed(() => {
    if (!props.periodStart.value) return [];

    const labels: string[] = [];
    for (let i = 0; i < NUM_COLUMNS; i++) {
      const day = new Date(props.periodStart.value);
      day.setDate(day.getDate() + i);
      const dayName = DAY_NAMES[day.getDay()];
      const dayNum = day.getDate();
      labels.push(`${dayName}\n${dayNum}`);
    }
    return labels;
  });

  const ganttBars = computed((): GanttBar[] => {
    if (!props.periodStart.value || !props.periodEnd.value) return [];

    const periodStartTime = props.periodStart.value.getTime();
    const periodEndTime = props.periodEnd.value.getTime();
    const periodDuration = periodEndTime - periodStartTime;

    const bars: GanttBar[] = [];

    props.cycles.value.forEach((cycle) => {
      // Clamp cycle to period bounds
      // Use effectiveEndDate for InProgress cycles (contains current time instead of projected end)
      const cycleStart = Math.max(cycle.startDate.getTime(), periodStartTime);
      const cycleEnd = Math.min(cycle.effectiveEndDate.getTime(), periodEndTime);

      if (cycleStart >= cycleEnd) return;

      // Calculate position as fraction of period (0 to numColumns)
      const startPos = ((cycleStart - periodStartTime) / periodDuration) * NUM_COLUMNS;
      const endPos = ((cycleEnd - periodStartTime) / periodDuration) * NUM_COLUMNS;

      // Use effectiveDuration for the label (proportional to the period)
      bars.push({
        cycleId: cycle.id,
        startPos,
        endPos,
        duration: formatDuration(Math.floor(cycle.effectiveDuration / MS_PER_MINUTE)),
        status: cycle.status,
        isExtended: cycle.isExtended,
        hasOverflowBefore: cycle.overflowBefore !== undefined,
        hasOverflowAfter: cycle.overflowAfter !== undefined,
      });
    });

    // Sort by start position
    bars.sort((a, b) => a.startPos - b.startPos);

    return bars;
  });

  return {
    chartTitle,
    dateRange,
    numColumns,
    dayLabels,
    ganttBars,
  };
}
