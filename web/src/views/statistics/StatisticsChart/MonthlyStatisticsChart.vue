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
    <div ref="chartContainerRef" class="statistics-chart__chart" :style="chartContainerStyle"></div>

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
        <div class="statistics-chart__legend-item">
          <div class="statistics-chart__legend-color statistics-chart__legend-color--overflow"></div>
          <span>Week-spanning</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, ref, toRef } from 'vue';
import { useMonthlyChartData } from './composables/useMonthlyChartData';
import { useMonthlyGanttChart } from './composables/useMonthlyGanttChart';

interface Props {
  cycles: readonly CycleStatisticsItem[];
  periodStart: Date | undefined;
  periodEnd: Date | undefined;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  nextPeriod: [];
  previousPeriod: [];
  cycleClick: [cycleId: string];
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

const { chartTitle, dateRange, numWeeks, dayLabels, weekDates, ganttBars } = useMonthlyChartData({
  cycles: toRef(() => props.cycles),
  periodStart: toRef(() => props.periodStart),
  periodEnd: toRef(() => props.periodEnd),
});

const { chartHeight } = useMonthlyGanttChart(chartContainerRef, {
  numWeeks,
  dayLabels,
  weekDates,
  ganttBars,
  onBarClick: (cycleId) => emit('cycleClick', cycleId),
  isLoading: toRef(() => props.loading),
});

const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));
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
    margin-top: 16px;
    // Height is set dynamically based on number of weeks
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
      gap: 4px;
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

      &--overflow {
        background: linear-gradient(135deg, #96f4a0 50%, $color-purple 50%);
        position: relative;

        &::after {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            135deg,
            rgba(0, 0, 0, 0.15),
            rgba(0, 0, 0, 0.15) 1px,
            transparent 2px,
            transparent 4px
          );
          border-radius: 2px;
        }
      }
    }
  }
}
</style>
