import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import { formatDuration } from '@/utils';
import type { GanttBar } from '../types';

interface UseMonthlyChartDataProps {
  cycles: Ref<readonly CycleStatisticsItem[]>;
  periodStart: Ref<Date | undefined>;
  periodEnd: Ref<Date | undefined>;
}

export function useMonthlyChartData(props: UseMonthlyChartDataProps) {
  const chartTitle = computed(() => 'Month Statistics');

  const dateRange = computed(() => {
    if (!props.periodStart.value) return '';
    return props.periodStart.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  // TODO: Implement monthly-specific column calculation
  const numColumns = computed(() => {
    if (!props.periodStart.value || !props.periodEnd.value) return 4;
    const endDate = new Date(props.periodEnd.value);
    const weekStart = new Date(props.periodStart.value);
    let count = 0;
    while (weekStart <= endDate) {
      count++;
      weekStart.setDate(weekStart.getDate() + 7);
    }
    return count;
  });

  // TODO: Implement monthly-specific labels
  const dayLabels = computed(() => {
    const labels: string[] = [];
    for (let i = 1; i <= numColumns.value; i++) {
      labels.push(`Week ${i}`);
    }
    return labels;
  });

  // TODO: Implement monthly-specific gantt bars calculation
  const ganttBars = computed((): GanttBar[] => {
    if (!props.periodStart.value || !props.periodEnd.value) return [];

    const periodStartTime = props.periodStart.value.getTime();
    const periodEndTime = props.periodEnd.value.getTime();
    const periodDuration = periodEndTime - periodStartTime;
    const cols = numColumns.value;

    const bars: GanttBar[] = [];

    props.cycles.value.forEach((cycle) => {
      const cycleStart = Math.max(cycle.startDate.getTime(), periodStartTime);
      const cycleEnd = Math.min(cycle.effectiveEndDate.getTime(), periodEndTime);

      if (cycleStart >= cycleEnd) return;

      const startPos = ((cycleStart - periodStartTime) / periodDuration) * cols;
      const endPos = ((cycleEnd - periodStartTime) / periodDuration) * cols;

      bars.push({
        cycleId: cycle.id,
        startPos,
        endPos,
        duration: formatDuration(Math.floor(cycle.effectiveDuration / (1000 * 60))),
        status: cycle.status,
        isExtended: cycle.isExtended,
        hasOverflowBefore: cycle.overflowBefore !== undefined,
        hasOverflowAfter: cycle.overflowAfter !== undefined,
      });
    });

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
