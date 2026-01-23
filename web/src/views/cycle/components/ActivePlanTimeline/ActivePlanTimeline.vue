<template>
  <div class="active-plan-timeline">
    <div class="active-plan-timeline__header">
      <h3 class="active-plan-timeline__title">Timeline</h3>
    </div>

    <div ref="chartContainerRef" class="active-plan-timeline__chart" :style="chartContainerStyle"></div>

    <div class="active-plan-timeline__legend">
      <div class="active-plan-timeline__legend-item">
        <span class="active-plan-timeline__legend-color active-plan-timeline__legend-color--planned"></span>
        <span class="active-plan-timeline__legend-text">Planned fast</span>
      </div>
      <div class="active-plan-timeline__legend-item">
        <span class="active-plan-timeline__legend-color active-plan-timeline__legend-color--completed"></span>
        <span class="active-plan-timeline__legend-text">Completed fast</span>
      </div>
      <div class="active-plan-timeline__legend-item">
        <span class="active-plan-timeline__legend-color active-plan-timeline__legend-color--active"></span>
        <span class="active-plan-timeline__legend-text">Active Fast</span>
      </div>
      <div class="active-plan-timeline__legend-item">
        <span class="active-plan-timeline__legend-color active-plan-timeline__legend-color--eating"></span>
        <span class="active-plan-timeline__legend-text">Eating Window</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PeriodResponse, PlanWithPeriodsResponse } from '@ketone/shared';
import { computed, onUnmounted, ref, toRef } from 'vue';
import type { AnyActorRef } from 'xstate';
import { Emit } from '../../actors/activePlan.actor';
import { useActivePlanTimelineChart } from './composables/useActivePlanTimelineChart';
import { useActivePlanTimelineData } from './composables/useActivePlanTimelineData';
import { useActivePlanTimelineHover } from './composables/useActivePlanTimelineHover';

const props = defineProps<{
  activePlan: PlanWithPeriodsResponse;
  currentPeriod: PeriodResponse | null;
  activePlanActorRef: AnyActorRef;
}>();

const chartContainerRef = ref<HTMLElement | null>(null);
const currentTime = ref(new Date());

const tickSubscription = props.activePlanActorRef.on(Emit.TICK, () => {
  currentTime.value = new Date();
});

onUnmounted(() => {
  tickSubscription.unsubscribe();
});

// Compute periods from active plan
const periods = computed(() => props.activePlan.periods);
const currentPeriodId = computed(() => props.currentPeriod?.id ?? null);

// Use hover state management
const { hoveredPeriodIndex, hoverPeriod, hoverExit } = useActivePlanTimelineHover();

// Use data transformation
const timelineData = useActivePlanTimelineData({
  periods,
  currentPeriodId,
  currentTime,
});

// Use chart rendering
const { chartHeight } = useActivePlanTimelineChart(chartContainerRef, {
  numRows: timelineData.numRows,
  dayLabels: timelineData.dayLabels,
  hourLabels: timelineData.hourLabels,
  hourPositions: timelineData.hourPositions,
  timelineBars: timelineData.timelineBars,
  periods,
  currentTimePosition: timelineData.currentTimePosition,
  hoveredPeriodIndex: toRef(hoveredPeriodIndex),
  onHoverPeriod: hoverPeriod,
  onHoverExit: hoverExit,
});

const chartContainerStyle = computed(() => ({
  height: `${chartHeight.value}px`,
}));
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$color-fasting-planned: #7abdff;
$color-fasting-completed: #96f4a0;
$color-fasting-active: #d795ff;
$color-eating: #ffc9b4;

.active-plan-timeline {
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

    &--planned {
      background: $color-fasting-planned;
    }

    &--completed {
      background: $color-fasting-completed;
    }

    &--active {
      background: $color-fasting-active;
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
