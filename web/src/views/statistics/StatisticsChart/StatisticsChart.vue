<template>
  <div class="statistics-chart">
    <div class="statistics-chart__header">
      <h2 class="statistics-chart__title">{{ chartTitle }}</h2>
      <div class="statistics-chart__navigation">
        <Button
          icon="pi pi-chevron-left"
          variant="text"
          rounded
          aria-label="Previous"
          size="small"
          severity="secondary"
          @click="emit('previousPeriod')"
        />
        <span class="statistics-chart__date-range">{{ dateRange }}</span>
        <Button
          icon="pi pi-chevron-right"
          variant="text"
          rounded
          aria-label="Next"
          size="small"
          severity="secondary"
          @click="emit('nextPeriod')"
        />
      </div>
    </div>

    <!-- eCharts canvas (includes labels + grid + bars) -->
    <div ref="chartContainerRef" class="statistics-chart__chart"></div>

    <div class="statistics-chart__legend">
      <div class="statistics-chart__legend-items">
        <div class="statistics-chart__legend-item">
          <div class="statistics-chart__legend-color statistics-chart__legend-color--fasting"></div>
          <span>Fasting time</span>
        </div>
        <div class="statistics-chart__legend-item">
          <div class="statistics-chart__legend-color statistics-chart__legend-color--active"></div>
          <span>Active fast</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type CycleStatisticsItem, type PeriodType, STATISTICS_PERIOD } from '@ketone/shared';
import { computed, ref } from 'vue';
import { formatDuration } from '@/utils';
import { useGanttChart } from './composables/useGanttChart';

interface Props {
  selectedPeriod: PeriodType;
  cycles: readonly CycleStatisticsItem[];
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
}

interface GanttBar {
  cycleId: string;
  startPos: number;
  endPos: number;
  duration: string;
  status: 'InProgress' | 'Completed';
  isExtended: boolean;
  hasOverflowBefore: boolean;
  hasOverflowAfter: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  nextPeriod: [];
  previousPeriod: [];
  cycleClick: [cycleId: string];
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

const chartTitle = computed(() => {
  return props.selectedPeriod === STATISTICS_PERIOD.WEEKLY ? 'Week Statistics' : 'Month Statistics';
});

const dateRange = computed(() => {
  if (!props.periodStart || !props.periodEnd) return '';

  const start = props.periodStart;
  const end = props.periodEnd;

  if (props.selectedPeriod === STATISTICS_PERIOD.WEEKLY) {
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }

  return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
});

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Number of columns based on period type
const numColumns = computed(() => {
  if (props.selectedPeriod === STATISTICS_PERIOD.WEEKLY) {
    return 7;
  }
  // Monthly: count weeks
  if (!props.periodStart || !props.periodEnd) return 4;
  const endDate = new Date(props.periodEnd);
  const weekStart = new Date(props.periodStart);
  let count = 0;
  while (weekStart <= endDate) {
    count++;
    weekStart.setDate(weekStart.getDate() + 7);
  }
  return count;
});

// Generate day labels
const dayLabels = computed(() => {
  if (!props.periodStart) return [];

  if (props.selectedPeriod === STATISTICS_PERIOD.WEEKLY) {
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(props.periodStart);
      day.setDate(day.getDate() + i);
      const dayName = DAY_NAMES[day.getDay()];
      const dayNum = day.getDate();
      labels.push(`${dayName}\n${dayNum}`);
    }
    return labels;
  }

  // Monthly: show weeks
  const labels: string[] = [];
  for (let i = 1; i <= numColumns.value; i++) {
    labels.push(`Week ${i}`);
  }
  return labels;
});

// Transform cycles to Gantt bars
const ganttBars = computed((): GanttBar[] => {
  if (!props.periodStart || !props.periodEnd) return [];

  const periodStartTime = props.periodStart.getTime();
  const periodEndTime = props.periodEnd.getTime();
  const periodDuration = periodEndTime - periodStartTime;
  const cols = numColumns.value;

  const bars: GanttBar[] = [];

  props.cycles.forEach((cycle) => {
    // Clamp cycle to period bounds
    // Use effectiveEndDate for InProgress cycles (contains current time instead of projected end)
    const cycleStart = Math.max(cycle.startDate.getTime(), periodStartTime);
    const cycleEnd = Math.min(cycle.effectiveEndDate.getTime(), periodEndTime);

    if (cycleStart >= cycleEnd) return;

    // Calculate position as fraction of period (0 to numColumns)
    const startPos = ((cycleStart - periodStartTime) / periodDuration) * cols;
    const endPos = ((cycleEnd - periodStartTime) / periodDuration) * cols;

    // Use effectiveDuration for the label (proportional to the period)
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

  // Sort by start position
  bars.sort((a, b) => a.startPos - b.startPos);

  return bars;
});

// Initialize eCharts Gantt chart
useGanttChart(chartContainerRef, {
  numColumns,
  dayLabels,
  ganttBars,
  onBarClick: (cycleId) => emit('cycleClick', cycleId),
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.statistics-chart {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__navigation {
    display: flex;
    align-items: center;
  }

  &__date-range {
    font-size: 10px;
    color: $color-primary-button-text;
    font-weight: 400;
  }

  &__chart {
    width: 100%;
    height: 120px; // 40px labels + 80px grid
    margin-top: 16px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      height: 160px; // 40px labels + 120px grid
    }
  }

  &__legend {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    &-title {
      font-size: 14px;
      font-weight: 600;
      color: $color-primary-button-text;
    }

    &-items {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    &-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: $color-primary-button-text;
    }

    &-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;

      &--fasting {
        background: #96f4a0;
      }

      &--active {
        background: $color-purple;
      }
    }
  }
}
</style>
