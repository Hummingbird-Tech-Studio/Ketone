import { useActor, useSelector } from '@xstate/vue';
import { computed, onUnmounted, watch, type Ref } from 'vue';
import {
  DialogState,
  Emit,
  Event,
  planTimelineMachine,
  State,
  type ChartDimensions,
  type EmitType,
} from '../actors/planTimeline.actor';
import type { DragBarType, DragEdge, GapInfo, PeriodConfig, PeriodUpdate } from '../types';

interface UsePlanTimelineOptions {
  periodConfigs: Ref<PeriodConfig[]>;
  onPeriodUpdated?: (periodIndex: number, changes: Partial<PeriodConfig>) => void;
  onPeriodDeleted?: (periodIndex: number) => void;
  onPeriodAdded?: (afterPeriodIndex: number, newPeriod: PeriodConfig) => void;
  onPeriodsDragUpdated?: (updates: PeriodUpdate[]) => void;
}

export function usePlanTimeline(options: UsePlanTimelineOptions) {
  const { send, actorRef } = useActor(planTimelineMachine, {
    input: { periodConfigs: options.periodConfigs.value },
  });

  // ============================================================
  // STATE SELECTORS
  // ============================================================

  const isIdle = useSelector(actorRef, (state) => state.matches(State.Idle));
  const isHoveringPeriod = useSelector(actorRef, (state) => state.matches(State.HoveringPeriod));
  const isHoveringGap = useSelector(actorRef, (state) => state.matches(State.HoveringGap));
  const isDragging = useSelector(actorRef, (state) => state.matches(State.Dragging));
  const isDialogOpen = useSelector(actorRef, (state) => state.matches(State.DialogOpen));
  const isEditMode = useSelector(actorRef, (state) =>
    state.matches({ [State.DialogOpen]: DialogState.Edit }),
  );
  const isAddMode = useSelector(actorRef, (state) =>
    state.matches({ [State.DialogOpen]: DialogState.Add }),
  );

  // ============================================================
  // CONTEXT DATA SELECTORS
  // ============================================================

  const hoveredPeriodIndex = useSelector(actorRef, (state) => state.context.hoveredPeriodIndex);
  const hoveredGapKey = useSelector(actorRef, (state) => state.context.hoveredGapKey);
  const dragState = useSelector(actorRef, (state) => state.context.dragState);
  const dialogContext = useSelector(actorRef, (state) => state.context.dialogContext);

  // ============================================================
  // COMPUTED PROPERTIES
  // ============================================================

  const hasActiveHover = computed(() =>
    hoveredPeriodIndex.value !== -1 || hoveredGapKey.value !== null,
  );

  const highlightedPeriodIndex = computed(() => {
    if (dragState.value?.isDragging) {
      return dragState.value.periodIndex;
    }
    return hoveredPeriodIndex.value;
  });

  const isDialogVisible = computed(() => isDialogOpen.value);

  const dialogMode = computed<'edit' | 'add'>(() => dialogContext.value?.mode ?? 'edit');

  const selectedPeriodIndex = computed(() => dialogContext.value?.selectedPeriodIndex ?? 0);

  const selectedGapInfo = computed(() => dialogContext.value?.selectedGapInfo ?? null);

  // ============================================================
  // ACTIONS
  // ============================================================

  // Hover actions
  const hoverPeriod = (periodIndex: number) => {
    send({ type: Event.HOVER_PERIOD, periodIndex });
  };

  const hoverGap = (gapKey: string) => {
    send({ type: Event.HOVER_GAP, gapKey });
  };

  const hoverExit = () => {
    send({ type: Event.HOVER_EXIT });
  };

  // Click actions
  const clickPeriod = (periodIndex: number) => {
    send({ type: Event.CLICK_PERIOD, periodIndex });
  };

  const clickGap = (gapInfo: GapInfo) => {
    send({ type: Event.CLICK_GAP, gapInfo });
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

  // Dialog actions
  const saveDialog = (fastingDuration: number, eatingWindow: number, startTime: Date) => {
    send({ type: Event.DIALOG_SAVE, fastingDuration, eatingWindow, startTime });
  };

  const deleteFromDialog = () => {
    send({ type: Event.DIALOG_DELETE });
  };

  const cancelDialog = () => {
    send({ type: Event.DIALOG_CANCEL });
  };

  // Data actions
  const updateChartDimensions = (dimensions: ChartDimensions) => {
    send({ type: Event.UPDATE_CHART_DIMENSIONS, dimensions });
  };

  // ============================================================
  // SYNC PERIOD CONFIGS FROM PARENT
  // ============================================================

  watch(
    options.periodConfigs,
    (newConfigs) => {
      send({ type: Event.UPDATE_PERIOD_CONFIGS, periodConfigs: newConfigs });
    },
    { deep: true },
  );

  // ============================================================
  // EVENT SUBSCRIPTIONS (for parent callbacks)
  // ============================================================

  const handleEmit = (emittedEvent: EmitType) => {
    switch (emittedEvent.type) {
      case Emit.PERIOD_UPDATED:
        options.onPeriodUpdated?.(emittedEvent.periodIndex, emittedEvent.changes);
        break;
      case Emit.PERIOD_DELETED:
        options.onPeriodDeleted?.(emittedEvent.periodIndex);
        break;
      case Emit.PERIOD_ADDED:
        options.onPeriodAdded?.(emittedEvent.afterPeriodIndex, emittedEvent.newPeriod);
        break;
      case Emit.PERIODS_DRAG_UPDATED:
        options.onPeriodsDragUpdated?.(emittedEvent.updates);
        break;
    }
  };

  const subscriptions = Object.values(Emit).map((emitType) =>
    actorRef.on(emitType, handleEmit),
  );

  onUnmounted(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
  });

  // ============================================================
  // RETURN
  // ============================================================

  return {
    // State checks
    isIdle,
    isHoveringPeriod,
    isHoveringGap,
    isDragging,
    isDialogOpen,
    isEditMode,
    isAddMode,

    // Context data for rendering
    hoveredPeriodIndex,
    hoveredGapKey,
    dragState,
    dialogContext,
    hasActiveHover,
    highlightedPeriodIndex,

    // Dialog bindings
    isDialogVisible,
    dialogMode,
    selectedPeriodIndex,
    selectedGapInfo,

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
    cancelDialog,

    // Chart dimension updates
    updateChartDimensions,

    // Actor ref for advanced usage
    actorRef,
  };
}
