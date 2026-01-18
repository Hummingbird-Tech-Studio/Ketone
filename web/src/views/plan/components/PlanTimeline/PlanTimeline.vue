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
      <div v-if="hasGaps" class="plan-timeline__legend-item">
        <span class="plan-timeline__legend-color plan-timeline__legend-color--gap"></span>
        <span class="plan-timeline__legend-text">Rest period</span>
      </div>
    </div>

    <PeriodEditDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :period-index="dialogPeriodIndex"
      :visible-period-number="dialogVisiblePeriodNumber"
      :fasting-duration="dialogFastingDuration"
      :eating-window="dialogEatingWindow"
      :start-time="dialogStartTime"
      :min-start-time="dialogMinStartTime"
      :next-period-start-time="dialogNextPeriodStartTime"
      @save="handlePeriodSave"
      @delete="handlePeriodDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { usePlanTimeline } from './composables/usePlanTimeline';
import { usePlanTimelineChart } from './composables/usePlanTimelineChart';
import { usePlanTimelineData } from './composables/usePlanTimelineData';
import PeriodEditDialog from './PeriodEditDialog.vue';
import type { PeriodConfig, PeriodUpdate } from './types';

const props = defineProps<{
  periodConfigs: PeriodConfig[];
}>();

const emit = defineEmits<{
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
  (e: 'deletePeriod', periodIndex: number): void;
  (e: 'addPeriod', data: { afterPeriodIndex: number; newPeriod: PeriodConfig }): void;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

// Default values for new periods
const DEFAULT_FASTING_HOURS = 16;
const DEFAULT_EATING_HOURS = 8;

// ============================================================
// XSTATE MACHINE (single source of truth for all state)
// ============================================================

const {
  // State checks
  isDragging,
  isDialogOpen,

  // Context data
  hoveredPeriodIndex,
  hoveredGapKey,
  dragState,
  selectedPeriodIndex,
  selectedGapInfo,
  dialogMode,

  // Hover actions
  hoverPeriod,
  hoverGap,
  hoverExit,

  // Click actions
  clickPeriod,
  clickGap,

  // Drag actions
  startDrag,
  moveDrag,
  endDrag,

  // Dialog actions
  saveDialog,
  deleteFromDialog,

  // Chart dimension updates
  updateChartDimensions,
} = usePlanTimeline({
  periodConfigs: toRef(() => props.periodConfigs),
  onPeriodUpdated: (periodIndex, changes) => {
    const newConfigs = [...props.periodConfigs];
    newConfigs[periodIndex] = {
      ...newConfigs[periodIndex]!,
      ...changes,
    };
    emit('update:periodConfigs', newConfigs);
  },
  onPeriodDeleted: (periodIndex) => {
    const newConfigs = [...props.periodConfigs];
    newConfigs[periodIndex] = {
      ...newConfigs[periodIndex]!,
      deleted: true,
    };
    emit('update:periodConfigs', newConfigs);
    emit('deletePeriod', periodIndex);
  },
  onPeriodAdded: (afterPeriodIndex, newPeriod) => {
    const insertIndex = afterPeriodIndex + 1;
    const newConfigs = [...props.periodConfigs];
    newConfigs.splice(insertIndex, 0, newPeriod);
    emit('update:periodConfigs', newConfigs);
    emit('addPeriod', { afterPeriodIndex, newPeriod });
  },
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

// ============================================================
// DATA TRANSFORMATION
// ============================================================

const timelineData = usePlanTimelineData({
  periodConfigs: toRef(() => props.periodConfigs),
});

// Check if timeline has any gaps (for legend visibility)
const hasGaps = computed(() => {
  return timelineData.timelineBars.value.some((bar) => bar.type === 'gap');
});

// ============================================================
// COMPUTED PROPS FOR DIALOG
// ============================================================

// Dialog visibility binding (bidirectional via v-model)
const dialogVisible = computed({
  get: () => isDialogOpen.value,
  set: (value) => {
    // Dialog closed from outside (e.g., clicking backdrop)
    if (!value && isDialogOpen.value) {
      // The dialog handles its own cancel event, so this is a fallback
    }
  },
});

// Get the selected period's config (for edit mode)
const selectedPeriodConfig = computed(() => {
  return props.periodConfigs[selectedPeriodIndex.value];
});

// Calculate the visible period number (counting only non-deleted periods)
const selectedPeriodVisibleNumber = computed(() => {
  let visibleNumber = 0;
  for (let i = 0; i <= selectedPeriodIndex.value; i++) {
    const config = props.periodConfigs[i];
    if (config && !config.deleted) {
      visibleNumber++;
    }
  }
  return visibleNumber;
});

// Calculate min start time for the selected period (edit mode)
const selectedPeriodMinStartTime = computed<Date | null>(() => {
  const configs = props.periodConfigs;
  const currentIndex = selectedPeriodIndex.value;

  let prevPeriodConfig: PeriodConfig | null = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (!configs[i]!.deleted) {
      prevPeriodConfig = configs[i]!;
      break;
    }
  }

  if (!prevPeriodConfig) return null;

  const prevEndTime = new Date(prevPeriodConfig.startTime);
  prevEndTime.setHours(prevEndTime.getHours() + prevPeriodConfig.fastingDuration + prevPeriodConfig.eatingWindow);

  return prevEndTime;
});

// Get the next period's start time for collision validation (edit mode)
const selectedNextPeriodStartTime = computed<Date | null>(() => {
  const configs = props.periodConfigs;
  const currentIndex = selectedPeriodIndex.value;

  for (let i = currentIndex + 1; i < configs.length; i++) {
    if (!configs[i]!.deleted) {
      return configs[i]!.startTime;
    }
  }

  return null;
});

// Gap info calculations for add mode
const gapStartTime = computed<Date | null>(() => {
  if (!selectedGapInfo.value) return null;
  const afterPeriod = props.periodConfigs[selectedGapInfo.value.afterPeriodIndex];
  if (!afterPeriod) return null;

  const endTime = new Date(afterPeriod.startTime);
  endTime.setHours(endTime.getHours() + afterPeriod.fastingDuration + afterPeriod.eatingWindow);
  return endTime;
});

const gapEndTime = computed<Date | null>(() => {
  if (!selectedGapInfo.value) return null;
  const beforePeriod = props.periodConfigs[selectedGapInfo.value.beforePeriodIndex];
  return beforePeriod ? beforePeriod.startTime : null;
});

// Dialog props computed based on mode
const dialogPeriodIndex = computed(() => {
  if (dialogMode.value === 'add') {
    return selectedGapInfo.value?.afterPeriodIndex ?? -1;
  }
  return selectedPeriodIndex.value;
});

const dialogVisiblePeriodNumber = computed(() => {
  if (dialogMode.value === 'add') return 0; // Not used in add mode
  return selectedPeriodVisibleNumber.value;
});

const dialogFastingDuration = computed(() => {
  if (dialogMode.value === 'add') return DEFAULT_FASTING_HOURS;
  return selectedPeriodConfig.value?.fastingDuration ?? 0;
});

const dialogEatingWindow = computed(() => {
  if (dialogMode.value === 'add') return DEFAULT_EATING_HOURS;
  return selectedPeriodConfig.value?.eatingWindow ?? 0;
});

const dialogStartTime = computed(() => {
  if (dialogMode.value === 'add') {
    return gapStartTime.value ?? new Date();
  }
  return selectedPeriodConfig.value?.startTime ?? new Date();
});

const dialogMinStartTime = computed<Date | null>(() => {
  if (dialogMode.value === 'add') {
    return gapStartTime.value;
  }
  return selectedPeriodMinStartTime.value;
});

const dialogNextPeriodStartTime = computed<Date | null>(() => {
  if (dialogMode.value === 'add') {
    return gapEndTime.value;
  }
  return selectedNextPeriodStartTime.value;
});

// ============================================================
// CHART RENDERING
// ============================================================

// Computed for drag period index
const dragPeriodIndex = computed(() => dragState.value?.periodIndex ?? null);

const { chartHeight } = usePlanTimelineChart(chartContainerRef, {
  // Data
  numRows: timelineData.numRows,
  dayLabels: timelineData.dayLabels,
  hourLabels: timelineData.hourLabels,
  hourPositions: timelineData.hourPositions,
  timelineBars: timelineData.timelineBars,
  periodConfigs: toRef(() => props.periodConfigs),

  // State from machine
  hoveredPeriodIndex,
  hoveredGapKey,
  isDragging,
  dragPeriodIndex,

  // Event dispatchers to machine
  onHoverPeriod: hoverPeriod,
  onHoverGap: hoverGap,
  onHoverExit: hoverExit,
  onClickPeriod: clickPeriod,
  onClickGap: clickGap,
  onDragStart: startDrag,
  onDragMove: moveDrag,
  onDragEnd: endDrag,
  onChartDimensionsChange: updateChartDimensions,
});

// Dynamic height
const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));

// ============================================================
// DIALOG HANDLERS
// ============================================================

function handlePeriodSave(data: { periodIndex: number; fastingDuration: number; eatingWindow: number; startTime: Date }) {
  saveDialog(data.fastingDuration, data.eatingWindow, data.startTime);
}

function handlePeriodDelete() {
  deleteFromDialog();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$color-fasting: #5b9bd5;
$color-eating: #f4b183;
$color-gap: #b0b0b0;

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
    cursor: pointer;
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

    &--gap {
      background: $color-gap;
    }
  }

  &__legend-text {
    font-size: 12px;
    color: $color-primary-light-text;
  }
}
</style>
