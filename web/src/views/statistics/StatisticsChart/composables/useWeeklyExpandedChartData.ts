import { formatDuration } from '@/utils';
import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import type { ExpandedGanttBar } from '../types';
import { MS_PER_MINUTE } from './chart/constants';
import { splitCycleByDay } from './chart/helpers';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NUM_ROWS = 7;

interface UseWeeklyExpandedChartDataProps {
  cycles: Ref<readonly CycleStatisticsItem[]>;
  periodStart: Ref<Date | undefined>;
  periodEnd: Ref<Date | undefined>;
}

export function useWeeklyExpandedChartData(props: UseWeeklyExpandedChartDataProps) {
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

  const numRows = computed(() => NUM_ROWS);

  // Day labels for Y-axis (row labels)
  const dayLabels = computed(() => {
    if (!props.periodStart.value) return [];

    const labels: string[] = [];
    for (let i = 0; i < NUM_ROWS; i++) {
      const day = new Date(props.periodStart.value);
      day.setDate(day.getDate() + i);
      const dayName = DAY_NAMES[day.getDay()];
      const dayNum = day.getDate();
      labels.push(`${dayName}\n${dayNum}`);
    }
    return labels;
  });

  // Hour labels for X-axis (simplified)
  const hourLabels = computed(() => ['12AM', '6AM', '12PM', '6PM']);
  const hourPositions = computed(() => [0, 6, 12, 18]);

  // Transform cycles into expanded bars (split by day)
  const expandedBars = computed((): ExpandedGanttBar[] => {
    if (!props.periodStart.value || !props.periodEnd.value) return [];

    const bars: ExpandedGanttBar[] = [];

    props.cycles.value.forEach((cycle) => {
      const segments = splitCycleByDay(
        cycle.startDate,
        cycle.effectiveEndDate,
        props.periodStart.value!,
        props.periodEnd.value!,
      );

      // Calculate total duration of the cycle (not clamped to period)
      const totalMinutes = Math.floor((cycle.effectiveEndDate.getTime() - cycle.startDate.getTime()) / MS_PER_MINUTE);

      segments.forEach((segment, idx) => {
        bars.push({
          cycleId: cycle.id,
          dayIndex: segment.dayIndex,
          startHour: segment.startHour,
          endHour: segment.endHour,
          duration: formatDuration(segment.durationMinutes),
          status: cycle.status,
          isExtended: cycle.isExtended,
          hasOverflowBefore: cycle.overflowBefore !== undefined,
          hasOverflowAfter: cycle.overflowAfter !== undefined,
          isConnectedToPrevious: idx > 0,
          isConnectedToNext: idx < segments.length - 1,
          totalDuration: formatDuration(totalMinutes),
          startDate: cycle.startDate,
          endDate: cycle.effectiveEndDate,
        });
      });
    });

    // Sort by day index, then by start hour
    bars.sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.startHour - b.startHour;
    });

    return bars;
  });

  return {
    chartTitle,
    dateRange,
    numRows,
    dayLabels,
    hourLabels,
    hourPositions,
    expandedBars,
  };
}
