<template>
  <div class="statistics-chart">
    <template v-if="showSkeleton">
      <div class="statistics-chart__header">
        <Skeleton width="130px" height="30px" border-radius="4px" />
        <div class="statistics-chart__navigation">
          <Skeleton width="100px" height="20px" border-radius="4px" />
        </div>
      </div>
      <div class="statistics-chart__skeleton-monthly">
        <div class="statistics-chart__skeleton-day-labels">
          <div class="statistics-chart__skeleton-week-spacer"></div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="10px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="14px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="10px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="14px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="10px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="10px" height="12px" border-radius="2px" />
          </div>
          <div class="statistics-chart__skeleton-day-label-cell">
            <Skeleton width="10px" height="12px" border-radius="2px" />
          </div>
        </div>
        <div class="statistics-chart__skeleton-weeks">
          <div class="statistics-chart__skeleton-week-labels">
            <div v-for="week in 5" :key="week" class="statistics-chart__skeleton-week-label">
              <Skeleton width="36px" height="10px" border-radius="2px" />
            </div>
          </div>
          <div class="statistics-chart__skeleton-grid">
            <div v-for="week in 5" :key="week" class="statistics-chart__skeleton-grid-row">
              <div v-for="day in 7" :key="day" class="statistics-chart__skeleton-cell">
                <Skeleton width="12px" height="10px" border-radius="2px" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="statistics-chart__legend">
        <div class="statistics-chart__legend-items">
          <Skeleton v-for="i in 3" :key="i" width="100px" height="14px" border-radius="4px" />
        </div>
      </div>
    </template>

    <template v-else>
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
    </template>
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
  showSkeleton: boolean;
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

  &__skeleton-monthly {
    margin-top: 16px;
  }

  &__skeleton-day-labels {
    display: flex;
    align-items: center;
    height: 30px;
  }

  &__skeleton-week-spacer {
    width: 32px;
    flex-shrink: 0;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      width: 50px;
    }
  }

  &__skeleton-day-label-cell {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  &__skeleton-weeks {
    display: flex;
  }

  &__skeleton-week-labels {
    display: flex;
    flex-direction: column;
    width: 32px;
    flex-shrink: 0;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      width: 50px;
    }
  }

  &__skeleton-week-label {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 4px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      justify-content: center;
      padding-right: 0;
    }
  }

  &__skeleton-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    border: 1px solid $color-primary-button-outline;
    border-radius: 8px;
    overflow: hidden;
  }

  &__skeleton-grid-row {
    display: flex;
    height: 70px;
    border-bottom: 1px solid $color-primary-button-outline;

    &:last-child {
      border-bottom: none;
    }
  }

  &__skeleton-cell {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12px;
    border-right: 1px solid $color-primary-button-outline;

    &:last-child {
      border-right: none;
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
