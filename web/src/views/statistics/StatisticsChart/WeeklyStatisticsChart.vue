<template>
  <div class="statistics-chart">
    <template v-if="showSkeleton">
      <div class="statistics-chart__header">
        <Skeleton width="130px" height="30px" border-radius="4px" />
        <div class="statistics-chart__navigation">
          <Skeleton width="100px" height="20px" border-radius="4px" />
        </div>
      </div>
      <div class="statistics-chart__skeleton-expanded">
        <div class="statistics-chart__skeleton-hour-labels">
          <div class="statistics-chart__skeleton-day-spacer"></div>
          <Skeleton v-for="i in 4" :key="i" width="32px" height="12px" border-radius="4px" />
        </div>
        <div class="statistics-chart__skeleton-grid">
          <div v-for="day in 7" :key="day" class="statistics-chart__skeleton-row">
            <div class="statistics-chart__skeleton-day-label">
              <Skeleton width="24px" height="10px" border-radius="2px" />
              <Skeleton width="16px" height="10px" border-radius="2px" />
            </div>
            <Skeleton class="statistics-chart__skeleton-cell" width="100%" height="32px" border-radius="6px" />
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
        <div class="statistics-chart__title-row">
          <h2 class="statistics-chart__title">{{ chartTitle }}</h2>
          <Button
            variant="text"
            rounded
            :aria-label="viewMode === 'condensed' ? 'Expand to daily view' : 'Collapse to weekly view'"
            size="small"
            severity="secondary"
            class="statistics-chart__view-toggle"
            @click="toggleViewMode"
          >
            <ExpandIcon v-if="viewMode === 'condensed'" class="statistics-chart__view-toggle-icon" />
            <CollapseIcon v-else class="statistics-chart__view-toggle-icon" />
          </Button>
        </div>
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
import CollapseIcon from '@/components/Icons/CollapseIcon.vue';
import ExpandIcon from '@/components/Icons/ExpandIcon.vue';
import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, ref, toRef } from 'vue';
import { useWeeklyChartData } from './composables/useWeeklyChartData';
import { useWeeklyExpandedChartData } from './composables/useWeeklyExpandedChartData';
import { useWeeklyExpandedGanttChart } from './composables/useWeeklyExpandedGanttChart';
import { useWeeklyGanttChart } from './composables/useWeeklyGanttChart';
import type { WeeklyChartViewMode } from './types';

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
const viewMode = ref<WeeklyChartViewMode>('expanded');

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'condensed' ? 'expanded' : 'condensed';
};

// Condensed view data
const condensedData = useWeeklyChartData({
  cycles: toRef(() => props.cycles),
  periodStart: toRef(() => props.periodStart),
  periodEnd: toRef(() => props.periodEnd),
});

// Expanded view data
const expandedData = useWeeklyExpandedChartData({
  cycles: toRef(() => props.cycles),
  periodStart: toRef(() => props.periodStart),
  periodEnd: toRef(() => props.periodEnd),
});

// Use computed to get active chart title/dateRange
const chartTitle = computed(() =>
  viewMode.value === 'condensed' ? condensedData.chartTitle.value : expandedData.chartTitle.value,
);
const dateRange = computed(() =>
  viewMode.value === 'condensed' ? condensedData.dateRange.value : expandedData.dateRange.value,
);

// Initialize condensed eCharts Gantt chart
useWeeklyGanttChart(chartContainerRef, {
  numColumns: condensedData.numColumns,
  dayLabels: condensedData.dayLabels,
  ganttBars: condensedData.ganttBars,
  onBarClick: (cycleId) => emit('cycleClick', cycleId),
  isLoading: toRef(() => props.loading),
  isActive: computed(() => viewMode.value === 'condensed'),
});

// Initialize expanded eCharts Gantt chart
const { chartHeight: expandedChartHeight } = useWeeklyExpandedGanttChart(chartContainerRef, {
  numRows: expandedData.numRows,
  dayLabels: expandedData.dayLabels,
  hourLabels: expandedData.hourLabels,
  hourPositions: expandedData.hourPositions,
  expandedBars: expandedData.expandedBars,
  onBarClick: (cycleId) => emit('cycleClick', cycleId),
  isLoading: toRef(() => props.loading),
  isActive: computed(() => viewMode.value === 'expanded'),
});

// Dynamic chart container style
const chartContainerStyle = computed(() => ({
  height: viewMode.value === 'expanded' ? `${expandedChartHeight.value}px` : undefined,
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
    flex-direction: column;
    gap: 8px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      gap: 0;
    }
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__view-toggle {
    width: 32px;
    height: 32px;
  }

  &__view-toggle-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: $color-primary-button-text;
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
    transition: height 0.2s ease;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      height: 160px; // 40px labels + 120px grid
    }
  }

  &__skeleton-expanded {
    margin-top: 20px;
  }

  &__skeleton-hour-labels {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-bottom: 8px;
    justify-content: space-around;
  }

  &__skeleton-day-spacer {
    width: 40px;
    flex-shrink: 0;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      width: 50px;
    }
  }

  &__skeleton-grid {
    display: flex;
    flex-direction: column;
    border: 1px solid $color-primary-button-outline;
    border-radius: 8px;
    overflow: hidden;
  }

  &__skeleton-row {
    display: flex;
    align-items: center;
    height: 46px;
    border-bottom: 1px solid $color-primary-button-outline;

    &:last-child {
      border-bottom: none;
    }
  }

  &__skeleton-day-label {
    width: 40px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      width: 50px;
    }
  }

  &__skeleton-cell {
    flex: 1;
    margin: 7px 4px;
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
