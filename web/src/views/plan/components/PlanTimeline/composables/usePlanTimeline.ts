import { useActor, useSelector } from '@xstate/vue';
import { computed, onUnmounted, watch, type Ref } from 'vue';
import { Emit, Event, planTimelineMachine, State, type ChartDimensions } from '../actors/planTimeline.actor';
import type { DragBarType, DragEdge, PeriodConfig, PeriodUpdate } from '../types';

interface UsePlanTimelineOptions {
  periodConfigs: Ref<PeriodConfig[]>;
  minPlanStartDate?: Ref<Date | null>;
  onPeriodsDragUpdated?: (updates: PeriodUpdate[]) => void;
}

export function usePlanTimeline(options: UsePlanTimelineOptions) {
  const { send, actorRef } = useActor(planTimelineMachine, {
    input: { periodConfigs: options.periodConfigs.value },
  });

  const isIdle = useSelector(actorRef, (state) => state.matches(State.Idle));
  const isHoveringPeriod = useSelector(actorRef, (state) => state.matches(State.HoveringPeriod));
  const isDragging = useSelector(actorRef, (state) => state.matches(State.Dragging));

  const hoveredPeriodIndex = useSelector(actorRef, (state) => state.context.hoveredPeriodIndex);
  const dragState = useSelector(actorRef, (state) => state.context.dragState);

  const hasActiveHover = computed(() => hoveredPeriodIndex.value !== -1);
  const highlightedPeriodIndex = computed(() => {
    if (dragState.value?.isDragging) {
      return dragState.value.periodIndex;
    }
    return hoveredPeriodIndex.value;
  });

  // Actions
  const hoverPeriod = (periodIndex: number) => {
    send({ type: Event.HOVER_PERIOD, periodIndex });
  };

  const hoverExit = () => {
    send({ type: Event.HOVER_EXIT });
  };

  // Drag actions
  const startDrag = (edge: DragEdge, barType: DragBarType, periodIndex: number, startX: number) => {
    send({ type: Event.DRAG_START, edge, barType, periodIndex, startX });
  };

  const moveDrag = (currentX: number) => {
    send({ type: Event.DRAG_MOVE, currentX });
  };

  const endDrag = () => {
    send({ type: Event.DRAG_END });
  };

  // Data actions
  const updateChartDimensions = (dimensions: ChartDimensions) => {
    send({ type: Event.UPDATE_CHART_DIMENSIONS, dimensions });
  };

  // Sync period configs from parent
  watch(
    options.periodConfigs,
    (newConfigs) => {
      send({ type: Event.UPDATE_PERIOD_CONFIGS, periodConfigs: newConfigs });
    },
    { deep: true },
  );

  // Sync minPlanStartDate from parent (if provided)
  if (options.minPlanStartDate) {
    watch(
      options.minPlanStartDate,
      (newMinDate) => {
        send({ type: Event.SET_MIN_START_DATE, minStartDate: newMinDate });
      },
      { immediate: true },
    );
  }

  // Event subscriptions (for parent callbacks)
  const subscription = actorRef.on(Emit.PERIODS_DRAG_UPDATED, (event) => {
    options.onPeriodsDragUpdated?.(event.updates);
  });

  onUnmounted(() => {
    subscription.unsubscribe();
  });

  return {
    // State checks
    isIdle,
    isHoveringPeriod,
    isDragging,

    // Context data for rendering
    hoveredPeriodIndex,
    dragState,
    hasActiveHover,
    highlightedPeriodIndex,

    // Hover actions
    hoverPeriod,
    hoverExit,

    // Drag actions
    startDrag,
    moveDrag,
    endDrag,

    // Chart dimension updates
    updateChartDimensions,

    // Actor ref for advanced usage
    actorRef,
  };
}
