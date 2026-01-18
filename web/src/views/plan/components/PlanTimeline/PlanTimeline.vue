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

    <PeriodEditDialog
      v-model:visible="isDialogVisible"
      :period-index="selectedPeriodIndex"
      :fasting-duration="selectedPeriodConfig?.fastingDuration ?? 0"
      :eating-window="selectedPeriodConfig?.eatingWindow ?? 0"
      :max-expandable-hours="selectedPeriodMaxExpandableHours"
      @save="handlePeriodSave"
      @delete="handlePeriodDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { usePlanTimelineChart } from './composables/usePlanTimelineChart';
import { usePlanTimelineData } from './composables/usePlanTimelineData';
import PeriodEditDialog from './PeriodEditDialog.vue';
import type { PeriodConfig } from './types';

const props = defineProps<{
  periodConfigs: PeriodConfig[];
}>();

const emit = defineEmits<{
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
  (e: 'deletePeriod', periodIndex: number): void;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);

// Dialog state
const isDialogVisible = ref(false);
const selectedPeriodIndex = ref(0);

// Get the selected period's config
const selectedPeriodConfig = computed(() => {
  return props.periodConfigs[selectedPeriodIndex.value];
});

// Calculate max expandable hours for the selected period
// This is the gap between this period's end and the next non-deleted period's start
const selectedPeriodMaxExpandableHours = computed<number | null>(() => {
  const configs = props.periodConfigs;
  const currentIndex = selectedPeriodIndex.value;
  const currentConfig = configs[currentIndex];

  if (!currentConfig) return null;

  // Find the next non-deleted period
  let nextPeriodConfig: PeriodConfig | null = null;
  for (let i = currentIndex + 1; i < configs.length; i++) {
    if (!configs[i]!.deleted) {
      nextPeriodConfig = configs[i]!;
      break;
    }
  }

  // If no next period found, no collision possible
  if (!nextPeriodConfig) return null;

  // Calculate current period's end time
  const currentEndTime = new Date(currentConfig.startTime);
  currentEndTime.setHours(currentEndTime.getHours() + currentConfig.fastingDuration + currentConfig.eatingWindow);

  // Calculate gap in hours between current end and next start
  const gapMs = nextPeriodConfig.startTime.getTime() - currentEndTime.getTime();
  const gapHours = gapMs / (1000 * 60 * 60);

  // Return the gap (can be negative if already overlapping, which shouldn't happen)
  return Math.max(0, gapHours);
});

// Data transformation
const timelineData = usePlanTimelineData({
  periodConfigs: toRef(() => props.periodConfigs),
});

// Handle period click
function handlePeriodClick(periodIndex: number) {
  selectedPeriodIndex.value = periodIndex;
  isDialogVisible.value = true;
}

// Chart rendering
const { chartHeight } = usePlanTimelineChart(chartContainerRef, {
  numRows: timelineData.numRows,
  dayLabels: timelineData.dayLabels,
  hourLabels: timelineData.hourLabels,
  hourPositions: timelineData.hourPositions,
  timelineBars: timelineData.timelineBars,
  periodConfigs: toRef(() => props.periodConfigs),
  onPeriodClick: handlePeriodClick,
});

// Dynamic height
const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));

// Dialog handlers
function handlePeriodSave(data: { periodIndex: number; fastingDuration: number; eatingWindow: number }) {
  const newConfigs = [...props.periodConfigs];
  newConfigs[data.periodIndex] = {
    ...newConfigs[data.periodIndex]!,
    fastingDuration: data.fastingDuration,
    eatingWindow: data.eatingWindow,
  };
  emit('update:periodConfigs', newConfigs);
  isDialogVisible.value = false;
}

function handlePeriodDelete(periodIndex: number) {
  const newConfigs = [...props.periodConfigs];
  newConfigs[periodIndex] = {
    ...newConfigs[periodIndex]!,
    deleted: true,
  };
  emit('update:periodConfigs', newConfigs);
  emit('deletePeriod', periodIndex);
  isDialogVisible.value = false;
}
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
