<template>
  <div class="timeline">
    <div v-if="showHeader" class="timeline__header">
      <div class="timeline__header-left">
        <h3 class="timeline__title">Timeline</h3>
        <slot name="subtitle"></slot>
      </div>
      <slot name="controls"></slot>
    </div>

    <div class="timeline__chart-wrapper">
      <div ref="chartContainerRef" class="timeline__chart" :style="chartContainerStyle"></div>
      <div v-if="isLoading" class="timeline__loading-overlay">
        <ProgressSpinner :style="{ width: '32px', height: '32px' }" />
      </div>
    </div>

    <div class="timeline__legend">
      <div class="timeline__legend-item">
        <span class="timeline__legend-color timeline__legend-color--fasting-planned"></span>
        <span class="timeline__legend-text">Planned Fast</span>
      </div>
      <div class="timeline__legend-item">
        <span class="timeline__legend-color timeline__legend-color--eating"></span>
        <span class="timeline__legend-text">Eating Window</span>
      </div>
      <div class="timeline__legend-item">
        <span class="timeline__legend-color timeline__legend-color--fasting-completed"></span>
        <span class="timeline__legend-text">Completed Fast</span>
      </div>
      <div class="timeline__legend-item">
        <span class="timeline__legend-color timeline__legend-color--fasting-active"></span>
        <span class="timeline__legend-text">Active Fast</span>
      </div>
      <div v-if="completedCycle" class="timeline__legend-item">
        <span class="timeline__legend-color timeline__legend-color--completed-cycle"></span>
        <span class="timeline__legend-text">Completed Cycle</span>
      </div>
      <div v-if="isCompletedCycleWeakSpanning" class="timeline__legend-item">
        <span
          class="timeline__legend-color timeline__legend-color--completed-cycle timeline__legend-color--striped"
        ></span>
        <span class="timeline__legend-text">Day-spanning</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdjacentCycle, PeriodResponse } from '@ketone/shared';
import { computed, ref, toRef, watch } from 'vue';
import type { AnyActorRef } from 'xstate';
import { useTimelineChart } from './composables/useTimelineChart';
import { useTimelineData } from './composables/useTimelineData';
import { useTimelineDrag } from './composables/useTimelineDrag';
import { useTimelineHover } from './composables/useTimelineHover';
import { useTimeSource } from './composables/useTimeSource';
import type {
  PeriodConfig,
  PeriodUpdate,
  TimelineMode,
  UseTimelineChartEditOptions,
  UseTimelineChartOptions,
  UseTimelineChartViewOptions,
} from './types';

const props = withDefaults(
  defineProps<{
    /** Mode: 'view' for read-only, 'edit' for drag-to-resize functionality */
    mode: TimelineMode;

    /** Periods data - use for view mode (PeriodResponse[]) */
    periods?: readonly PeriodResponse[];
    /** Period configs - use for edit mode (PeriodConfig[]) */
    periodConfigs?: PeriodConfig[];

    /** Tracking the current period (view mode only) */
    currentPeriodId?: string | null;

    /** Time source for current time marker */
    timeSource?: 'tick' | 'interval';
    /** Actor ref that emits TICK events (required if timeSource='tick') */
    tickActorRef?: AnyActorRef;
    /** Emit event name for TICK (default: 'TICK') */
    tickEventName?: string;

    /** Completed cycle to show (edit mode only) */
    completedCycle?: AdjacentCycle | null;
    /** Min start date for first period - prevents overlap with last cycle (edit mode only) */
    minPlanStartDate?: Date | null;

    /** Whether to show the header (title + controls). Defaults to true. */
    showHeader?: boolean;

    /** Whether the timeline is in a loading state (edit mode only) */
    isLoading?: boolean;
  }>(),
  {
    periods: undefined,
    periodConfigs: undefined,
    currentPeriodId: null,
    timeSource: 'interval',
    tickActorRef: undefined,
    tickEventName: 'TICK',
    completedCycle: null,
    minPlanStartDate: null,
    showHeader: true,
    isLoading: false,
  },
);

const emit = defineEmits<{
  /** Emitted when period configs are updated via drag (edit mode) */
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
  /** Emitted when period progress changes (edit mode) */
  (e: 'periodProgress', payload: { completedCount: number; currentIndex: number; total: number }): void;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

const isEditMode = computed(() => props.mode === 'edit');

// ========================================
// State Management
// ========================================

// For view mode: use simple hover state
const viewModeHover = useTimelineHover();

// For edit mode: use full drag state management with XState
const editModeDrag = isEditMode.value
  ? useTimelineDrag({
      periodConfigs: toRef(() => props.periodConfigs ?? []),
      minPlanStartDate: toRef(() => props.minPlanStartDate),
      onPeriodsDragUpdated: (updates: PeriodUpdate[]) => {
        if (!props.periodConfigs) return;
        const newConfigs = [...props.periodConfigs];
        for (const update of updates) {
          newConfigs[update.periodIndex] = {
            ...newConfigs[update.periodIndex]!,
            ...update.changes,
          };
        }
        emit('update:periodConfigs', newConfigs);
      },
    })
  : null;

// Unified hover/drag state access
const hoveredPeriodIndex = computed(() =>
  isEditMode.value ? (editModeDrag?.hoveredPeriodIndex.value ?? -1) : viewModeHover.hoveredPeriodIndex.value,
);

const isDragging = computed(() => (isEditMode.value ? (editModeDrag?.isDragging.value ?? false) : false));

const dragState = computed(() => (isEditMode.value ? (editModeDrag?.dragState.value ?? null) : null));

const dragPeriodIndex = computed(() => dragState.value?.periodIndex ?? null);

// Hover handlers
const onHoverPeriod = (periodIndex: number) => {
  if (isEditMode.value) {
    editModeDrag?.hoverPeriod(periodIndex);
  } else {
    viewModeHover.hoverPeriod(periodIndex);
  }
};

const onHoverExit = () => {
  if (isEditMode.value) {
    editModeDrag?.hoverExit();
  } else {
    viewModeHover.hoverExit();
  }
};

// ========================================
// Time Source
// ========================================

const { currentTime } = useTimeSource({
  source: props.timeSource ?? 'interval',
  tickActorRef: props.tickActorRef,
  tickEventName: props.tickEventName,
  pauseWhenDragging: isEditMode.value,
  isDragging,
});

// ========================================
// Timeline Data
// ========================================

const timelineData = useTimelineData({
  mode: props.mode,
  periods: toRef(() => props.periods ?? []),
  currentPeriodId: toRef(() => props.currentPeriodId),
  periodConfigs: toRef(() => props.periodConfigs ?? []),
  completedCycle: toRef(() => props.completedCycle),
  currentTime,
});

// Emit period progress when values change (edit mode only)
if (isEditMode.value) {
  watch(
    [timelineData.completedPeriodsCount, timelineData.currentPeriodIndex, () => props.periodConfigs?.length ?? 0],
    ([completedCount, currentIndex, total]) => {
      emit('periodProgress', { completedCount, currentIndex, total });
    },
    { immediate: true },
  );
}

// Check if the completed cycle spans multiple days (weak spanning)
const isCompletedCycleWeakSpanning = computed(() => {
  const cycle = props.completedCycle;
  if (!cycle) return false;

  const startDay = new Date(cycle.startDate);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(cycle.endDate);
  endDay.setHours(0, 0, 0, 0);

  return startDay.getTime() !== endDay.getTime();
});

// ========================================
// Chart
// ========================================

// Build chart options based on mode (discriminated union for type safety)
function buildChartOptions(): UseTimelineChartOptions {
  const baseOptions = {
    numRows: timelineData.numRows,
    dayLabels: timelineData.dayLabels,
    hourLabels: timelineData.hourLabels,
    hourPositions: timelineData.hourPositions,
    timelineBars: timelineData.timelineBars,
    currentTimePosition: timelineData.currentTimePosition,
    hoveredPeriodIndex: toRef(hoveredPeriodIndex),
    onHoverPeriod,
    onHoverExit,
  };

  if (props.mode === 'edit') {
    if (!editModeDrag) {
      throw new Error(
        '[Timeline] mode is "edit" but drag composable was not initialized. Mode must be static and set to "edit" at mount time.',
      );
    }

    return {
      ...baseOptions,
      mode: 'edit',
      completedCycleBars: timelineData.completedCycleBars,
      periodConfigs: toRef(() => props.periodConfigs ?? []),
      isDragging,
      dragPeriodIndex,
      dragState,
      onDragStart: editModeDrag.startDrag,
      onDragMove: editModeDrag.moveDrag,
      onDragEnd: editModeDrag.endDrag,
      onChartDimensionsChange: editModeDrag.updateChartDimensions,
    } satisfies UseTimelineChartEditOptions;
  }

  return {
    ...baseOptions,
    mode: 'view',
    periods: toRef(() => props.periods ?? []),
  } satisfies UseTimelineChartViewOptions;
}

const { chartHeight } = useTimelineChart(chartContainerRef, buildChartOptions());

const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));

// ========================================
// Expose
// ========================================

// Expose period progress data for parent components (edit mode)
const totalPeriodsCount = computed(() => props.periodConfigs?.length ?? 0);

defineExpose({
  completedPeriodsCount: timelineData.completedPeriodsCount,
  currentPeriodIndex: timelineData.currentPeriodIndex,
  totalPeriodsCount,
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.timeline {
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
    justify-content: space-evenly;
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
      background: $color-fasting-planned;
    }

    &--fasting-completed {
      background: $color-fasting-completed;
    }

    &--fasting-active {
      background: $color-fasting-active;
    }

    &--eating {
      background: $color-eating;
    }

    &--completed-cycle {
      background: $color-completed-cycle;
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
