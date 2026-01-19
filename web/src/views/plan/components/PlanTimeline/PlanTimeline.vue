<template>
  <div class="plan-timeline">
    <div class="plan-timeline__header">
      <h3 class="plan-timeline__title">Timeline</h3>
    </div>

    <div ref="chartContainerRef" class="plan-timeline__chart" :style="chartContainerStyle"></div>

    <div class="plan-timeline__legend">
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--fasting"></span>
        <span class="plan-timeline__legend-text">Planned fast</span>
      </div>
      <div class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--eating"></span>
        <span class="plan-timeline__legend-text">Eating Window</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { usePlanTimeline } from './composables/usePlanTimeline';
import { usePlanTimelineChart } from './composables/usePlanTimelineChart';
import { usePlanTimelineData } from './composables/usePlanTimelineData';
import type { PeriodConfig, PeriodUpdate } from './types';

const props = defineProps<{
  periodConfigs: PeriodConfig[];
}>();

const emit = defineEmits<{
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

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
});

const dragPeriodIndex = computed(() => dragState.value?.periodIndex ?? null);

const { chartHeight } = usePlanTimelineChart(chartContainerRef, {
  numRows: timelineData.numRows,
  dayLabels: timelineData.dayLabels,
  hourLabels: timelineData.hourLabels,
  hourPositions: timelineData.hourPositions,
  timelineBars: timelineData.timelineBars,
  periodConfigs: toRef(() => props.periodConfigs),

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
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$color-fasting: #5b9bd5;
$color-eating: #f4b183;

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
    align-items: center;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: $color-primary-button-text;
    margin: 0;
  }

  &__chart {
    width: 100%;
  }

  &__legend {
    display: flex;
    gap: 24px;
    padding-top: 8px;
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

    &--fasting {
      background: $color-fasting;
    }

    &--eating {
      background: $color-eating;
    }
  }

  &__legend-text {
    font-size: 12px;
    color: $color-primary-light-text;
  }
}
</style>
