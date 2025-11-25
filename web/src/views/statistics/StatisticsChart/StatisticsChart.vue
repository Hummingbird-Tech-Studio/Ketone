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

    <div class="statistics-chart__timeline" :style="{ '--columns': numColumns }">
      <!-- Day labels row -->
      <div v-for="(label, index) in dayLabels" :key="'label-' + index" class="statistics-chart__day-label">
        <template v-if="label.includes('\n')">
          <span class="statistics-chart__day-name">{{ label.split('\n')[0] }}</span>
          <span class="statistics-chart__day-num">{{ label.split('\n')[1] }}</span>
        </template>
        <span v-else class="statistics-chart__day-name">{{ label }}</span>
      </div>

      <!-- Grid container with vertical dividers -->
      <div class="statistics-chart__grid">
        <!-- Vertical dividers -->
        <div
          v-for="i in numColumns - 1"
          :key="'divider-' + i"
          class="statistics-chart__divider"
          :style="{ '--position': i }"
        ></div>

        <!-- Gantt bars -->
        <div
          v-for="bar in ganttBars"
          :key="bar.cycleId"
          class="statistics-chart__bar"
          :class="{
            'statistics-chart__bar--active': bar.status === 'InProgress',
            'statistics-chart__bar--extended': bar.isExtended,
            'statistics-chart__bar--overflow-before': bar.hasOverflowBefore,
            'statistics-chart__bar--overflow-after': bar.hasOverflowAfter,
          }"
          :style="{
            '--start': bar.startPos,
            '--span': bar.endPos - bar.startPos,
          }"
          @click="emit('cycleClick', bar.cycleId)"
        >
          <span class="statistics-chart__bar-label">{{ bar.duration }}</span>
        </div>
      </div>
    </div>

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
import { computed } from 'vue';

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

// Format duration for labels
const formatDuration = (ms: number): string => {
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${totalHours}h`;
};

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
    const cycleStart = Math.max(cycle.startDate.getTime(), periodStartTime);
    const cycleEnd = Math.min(cycle.endDate.getTime(), periodEndTime);

    if (cycleStart >= cycleEnd) return;

    // Calculate position as fraction of period (0 to numColumns)
    const startPos = ((cycleStart - periodStartTime) / periodDuration) * cols;
    const endPos = ((cycleEnd - periodStartTime) / periodDuration) * cols;

    // Use effectiveDuration for the label (proportional to the period)
    bars.push({
      cycleId: cycle.id,
      startPos,
      endPos,
      duration: formatDuration(cycle.effectiveDuration),
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

  &__timeline {
    display: grid;
    grid-template-columns: repeat(var(--columns), 1fr);
    margin-top: 16px;
    gap: 4px;
  }

  &__day-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 11px;
    color: #494949;
    padding-bottom: 8px;
  }

  &__day-name {
    font-weight: 500;
  }

  &__day-num {
    font-weight: 400;
  }

  &__grid {
    grid-column: 1 / -1;
    position: relative;
    height: 80px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    background: transparent;
  }

  &__divider {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc((var(--position) / var(--columns)) * 100%);
    width: 1px;
    background: #e0e0e0;
  }

  &__bar {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: calc((var(--start) / var(--columns)) * 100% + 4px);
    width: calc((var(--span) / var(--columns)) * 100% - 8px);
    background: #96f4a0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-sizing: border-box;
    overflow: hidden;

    &--active {
      background: $color-purple;
    }

    // Extended cycle styling with diagonal stripes on edges
    &--overflow-before::before,
    &--overflow-after::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 12px;
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.15) 2px,
        rgba(0, 0, 0, 0.15) 4px
      );
    }

    &--overflow-before::before {
      left: 0;
      border-radius: 8px 0 0 8px;
    }

    &--overflow-after::after {
      right: 0;
      border-radius: 0 8px 8px 0;
    }
  }

  &__bar-label {
    font-size: 12px;
    font-weight: 600;
    color: #333;
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
