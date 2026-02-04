<template>
  <div class="plan-timeline">
    <div class="plan-timeline__header">
      <div class="plan-timeline__header-left">
        <h3 class="plan-timeline__title">Timeline</h3>
        <slot name="subtitle"></slot>
      </div>
      <Button
        v-if="showResetButton"
        type="button"
        icon="pi pi-refresh"
        rounded
        variant="outlined"
        severity="secondary"
        aria-label="Reset Timeline"
        :disabled="!hasChanges || loading"
        @click="$emit('reset')"
      />
    </div>

    <div class="plan-timeline__chart-wrapper">
      <div ref="chartContainerRef" class="plan-timeline__chart" :style="chartContainerStyle"></div>
      <div v-if="loading" class="plan-timeline__loading-overlay">
        <ProgressSpinner :style="{ width: '32px', height: '32px' }" />
      </div>
    </div>

    <div class="plan-timeline__legend">
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--fasting-planned"></span>
        <span class="plan-timeline__legend-text">Planned Fast</span>
      </div>
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--eating"></span>
        <span class="plan-timeline__legend-text">Eating Window</span>
      </div>
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--fasting-completed"></span>
        <span class="plan-timeline__legend-text">Completed Fast</span>
      </div>
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--fasting-active"></span>
        <span class="plan-timeline__legend-text">Active Fast</span>
      </div>
      <div v-if="lastCompletedCycle" class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--last-cycle"></span>
        <span class="plan-timeline__legend-text">Completed Cycle</span>
      </div>
      <div v-if="isLastCycleWeakSpanning" class="plan-timeline__legend-item">
        <span
          class="plan-timeline__legend-color plan-timeline__legend-color--last-cycle plan-timeline__legend-color--striped"
        ></span>
        <span class="plan-timeline__legend-text">Day-spanning</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdjacentCycle } from '@ketone/shared';
import { computed, onUnmounted, ref, toRef, watch } from 'vue';
import { usePlanTimeline } from './composables/usePlanTimeline';
import { usePlanTimelineChart } from './composables/usePlanTimelineChart';
import { usePlanTimelineData } from './composables/usePlanTimelineData';
import type { PeriodConfig, PeriodUpdate } from './types';

// Refresh interval for current time marker (in milliseconds)
const CURRENT_TIME_REFRESH_INTERVAL = 60000; // 1 minute

const props = withDefaults(
  defineProps<{
    periodConfigs: PeriodConfig[];
    lastCompletedCycle?: AdjacentCycle | null;
    loading?: boolean;
    showResetButton?: boolean;
    hasChanges?: boolean;
  }>(),
  {
    showResetButton: false,
    hasChanges: false,
  },
);

const emit = defineEmits<{
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
  (e: 'periodProgress', payload: { completedCount: number; currentIndex: number; total: number }): void;
  (e: 'reset'): void;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);
const currentTime = ref(new Date());

// Calculate min plan start date (cannot start before last cycle ends)
const minPlanStartDate = computed(() => props.lastCompletedCycle?.endDate ?? null);

const {
  // State checks
  isDragging,

  // Context data
  hoveredPeriodIndex,
  dragState,

  // Hover actions
  hoverPeriod,
  hoverExit,

  // Drag actions
  startDrag,
  moveDrag,
  endDrag,

  // Chart dimension updates
  updateChartDimensions,
} = usePlanTimeline({
  periodConfigs: toRef(() => props.periodConfigs),
  minPlanStartDate,
  onPeriodsDragUpdated: (updates: PeriodUpdate[]) => {
    const newConfigs = [...props.periodConfigs];
    for (const update of updates) {
      newConfigs[update.periodIndex] = {
        ...newConfigs[update.periodIndex]!,
        ...update.changes,
      };
    }
    emit('update:periodConfigs', newConfigs);
  },
});

const timelineData = usePlanTimelineData({
  periodConfigs: toRef(() => props.periodConfigs),
  lastCompletedCycle: toRef(() => props.lastCompletedCycle ?? null),
  currentTime,
});

// Emit period progress when values change (due to time passing or drag updates)
watch(
  [timelineData.completedPeriodsCount, timelineData.currentPeriodIndex, () => props.periodConfigs.length],
  ([completedCount, currentIndex, total]) => {
    emit('periodProgress', { completedCount, currentIndex, total });
  },
  { immediate: true },
);

const dragPeriodIndex = computed(() => dragState.value?.periodIndex ?? null);

const { chartHeight } = usePlanTimelineChart(chartContainerRef, {
  numRows: timelineData.numRows,
  dayLabels: timelineData.dayLabels,
  hourLabels: timelineData.hourLabels,
  hourPositions: timelineData.hourPositions,
  timelineBars: timelineData.timelineBars,
  completedCycleBars: timelineData.completedCycleBars,
  periodConfigs: toRef(() => props.periodConfigs),
  currentTimePosition: timelineData.currentTimePosition,

  // State from machine
  hoveredPeriodIndex,
  isDragging,
  dragPeriodIndex,
  dragState,

  // Event dispatchers to machine
  onHoverPeriod: hoverPeriod,
  onHoverExit: hoverExit,
  onDragStart: startDrag,
  onDragMove: moveDrag,
  onDragEnd: endDrag,
  onChartDimensionsChange: updateChartDimensions,
});

const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));

// Check if the last completed cycle spans multiple days (weak spanning)
const isLastCycleWeakSpanning = computed(() => {
  const cycle = props.lastCompletedCycle;
  if (!cycle) return false;

  const startDay = new Date(cycle.startDate);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(cycle.endDate);
  endDay.setHours(0, 0, 0, 0);

  return startDay.getTime() !== endDay.getTime();
});

// Set up interval to refresh current time marker
// Skip updates during drag to prevent interference
const refreshInterval = setInterval(() => {
  if (!isDragging.value) {
    currentTime.value = new Date();
  }
}, CURRENT_TIME_REFRESH_INTERVAL);

onUnmounted(() => {
  clearInterval(refreshInterval);
});

// Expose period progress data for parent components
const totalPeriodsCount = computed(() => props.periodConfigs.length);

defineExpose({
  completedPeriodsCount: timelineData.completedPeriodsCount,
  currentPeriodIndex: timelineData.currentPeriodIndex,
  totalPeriodsCount,
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$color-fasting: #99ccff;
$color-eating: #ffeecc;

.plan-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: $color-white;
  border: 1px solid $color-primary-button-outline;
  border-radius: 12px;

  &__header {
    display: flex;
    justify-content: space-between;
  }

  &__header-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__chart-wrapper {
    position: relative;
  }

  &__chart {
    width: 100%;
  }

  &__loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 8px;
  }

  &__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-top: 8px;

    @media only screen and (min-width: $breakpoint-tablet-min-width) {
      gap: 24px;
    }
  }

  &__legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__legend-color {
    width: 12px;
    height: 12px;
    border-radius: 3px;

    &--fasting-planned {
      background: $color-fasting;
    }

    &--fasting-completed {
      background: #97ebdb;
    }

    &--fasting-active {
      background: #dfc9fb;
    }

    &--eating {
      background: $color-eating;
    }

    &--last-cycle {
      background: #96f4a0;
    }

    &--striped {
      background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 3px,
        rgba(0, 0, 0, 0.15) 3px,
        rgba(0, 0, 0, 0.15) 5px
      );
    }
  }

  &__legend-text {
    font-size: 12px;
    color: $color-primary-light-text;
  }
}
</style>
