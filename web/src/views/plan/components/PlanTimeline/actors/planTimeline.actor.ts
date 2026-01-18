import { assertEvent, assign, emit, setup } from 'xstate';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
} from '../../../constants';
import type { DragBarType, DragEdge, DragState, GapInfo, PeriodConfig, PeriodUpdate } from '../types';

// ============================================================
// ENUMS
// ============================================================

export enum State {
  Idle = 'Idle',
  HoveringPeriod = 'HoveringPeriod',
  HoveringGap = 'HoveringGap',
  Dragging = 'Dragging',
  DialogOpen = 'DialogOpen',
}

export enum DialogState {
  Edit = 'Edit',
  Add = 'Add',
}

export enum Event {
  // Hover events
  HOVER_PERIOD = 'HOVER_PERIOD',
  HOVER_GAP = 'HOVER_GAP',
  HOVER_EXIT = 'HOVER_EXIT',

  // Click events
  CLICK_PERIOD = 'CLICK_PERIOD',
  CLICK_GAP = 'CLICK_GAP',

  // Drag events
  DRAG_START = 'DRAG_START',
  DRAG_MOVE = 'DRAG_MOVE',
  DRAG_END = 'DRAG_END',

  // Dialog events
  DIALOG_SAVE = 'DIALOG_SAVE',
  DIALOG_DELETE = 'DIALOG_DELETE',
  DIALOG_CANCEL = 'DIALOG_CANCEL',

  // Data events (from parent)
  UPDATE_PERIOD_CONFIGS = 'UPDATE_PERIOD_CONFIGS',
  UPDATE_CHART_DIMENSIONS = 'UPDATE_CHART_DIMENSIONS',
}

export enum Emit {
  PERIOD_UPDATED = 'PERIOD_UPDATED',
  PERIOD_DELETED = 'PERIOD_DELETED',
  PERIOD_ADDED = 'PERIOD_ADDED',
  PERIODS_DRAG_UPDATED = 'PERIODS_DRAG_UPDATED',
}

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface DialogContext {
  mode: 'edit' | 'add';
  selectedPeriodIndex: number | null;
  selectedGapInfo: GapInfo | null;
}

export interface ChartDimensions {
  width: number;
  dayLabelWidth: number;
  gridWidth: number;
}

export interface Context {
  periodConfigs: PeriodConfig[];
  hoveredPeriodIndex: number; // -1 = none
  hoveredGapKey: string | null;
  dragState: DragState | null;
  dialogContext: DialogContext | null;
  chartDimensions: ChartDimensions;
}

export type EventType =
  // Hover events
  | { type: Event.HOVER_PERIOD; periodIndex: number }
  | { type: Event.HOVER_GAP; gapKey: string }
  | { type: Event.HOVER_EXIT }

  // Click events
  | { type: Event.CLICK_PERIOD; periodIndex: number }
  | { type: Event.CLICK_GAP; gapInfo: GapInfo }

  // Drag events
  | {
      type: Event.DRAG_START;
      edge: DragEdge;
      barType: DragBarType;
      periodIndex: number;
      startX: number;
    }
  | { type: Event.DRAG_MOVE; currentX: number }
  | { type: Event.DRAG_END }

  // Dialog events
  | {
      type: Event.DIALOG_SAVE;
      fastingDuration: number;
      eatingWindow: number;
      startTime: Date;
    }
  | { type: Event.DIALOG_DELETE }
  | { type: Event.DIALOG_CANCEL }

  // Data events
  | { type: Event.UPDATE_PERIOD_CONFIGS; periodConfigs: PeriodConfig[] }
  | { type: Event.UPDATE_CHART_DIMENSIONS; dimensions: ChartDimensions };

export type EmitType =
  | {
      type: Emit.PERIOD_UPDATED;
      periodIndex: number;
      changes: Partial<PeriodConfig>;
    }
  | { type: Emit.PERIOD_DELETED; periodIndex: number }
  | {
      type: Emit.PERIOD_ADDED;
      afterPeriodIndex: number;
      newPeriod: PeriodConfig;
    }
  | { type: Emit.PERIODS_DRAG_UPDATED; updates: PeriodUpdate[] };

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getInitialContext(periodConfigs: PeriodConfig[]): Context {
  return {
    periodConfigs,
    hoveredPeriodIndex: -1,
    hoveredGapKey: null,
    dragState: null,
    dialogContext: null,
    chartDimensions: {
      width: 0,
      dayLabelWidth: 0,
      gridWidth: 0,
    },
  };
}

function findPreviousNonDeletedPeriodIndex(configs: PeriodConfig[], periodIndex: number): number {
  for (let i = periodIndex - 1; i >= 0; i--) {
    const config = configs[i];
    if (config && !config.deleted) return i;
  }
  return -1;
}

function findNextNonDeletedPeriodIndex(configs: PeriodConfig[], periodIndex: number): number {
  for (let i = periodIndex + 1; i < configs.length; i++) {
    const config = configs[i];
    if (config && !config.deleted) return i;
  }
  return -1;
}

function pixelsToHours(pixelDelta: number, gridWidth: number): number {
  if (gridWidth <= 0) return 0;
  const hoursPerPixel = 24 / gridWidth;
  return Math.round(pixelDelta * hoursPerPixel);
}

function calculateDragUpdates(context: Context, hourDelta: number): PeriodUpdate[] | null {
  const dragState = context.dragState;
  if (!dragState) return null;

  const { periodIndex, edge, barType } = dragState;
  const originalStartTime = dragState.originalStartTime;
  const originalFastingDuration = dragState.originalFastingDuration;
  const originalEatingWindow = dragState.originalEatingWindow;

  const prevPeriodIndex = dragState.prevPeriodIndex;
  const originalPrevEatingWindow = dragState.originalPrevEatingWindow;
  const hasPrevPeriod = prevPeriodIndex !== -1;

  const nextPeriodIndex = dragState.nextPeriodIndex;
  const originalNextFastingDuration = dragState.originalNextFastingDuration;
  const hasNextPeriod = nextPeriodIndex !== -1;

  if (barType === 'fasting' && edge === 'left') {
    const newStartTime = new Date(originalStartTime);
    newStartTime.setHours(newStartTime.getHours() + hourDelta);
    const newFastingDuration = originalFastingDuration - hourDelta;

    if (newFastingDuration < MIN_FASTING_DURATION_HOURS) return null;

    if (hasPrevPeriod) {
      const prevNewEating = originalPrevEatingWindow + hourDelta;
      if (prevNewEating < MIN_EATING_WINDOW_HOURS) return null;
      if (prevNewEating > MAX_EATING_WINDOW_HOURS) return null;

      return [
        { periodIndex: prevPeriodIndex, changes: { eatingWindow: prevNewEating } },
        { periodIndex, changes: { startTime: newStartTime, fastingDuration: newFastingDuration } },
      ];
    }

    return [{ periodIndex, changes: { startTime: newStartTime, fastingDuration: newFastingDuration } }];
  }

  if (barType === 'fasting' && edge === 'right') {
    const newFastingDuration = originalFastingDuration + hourDelta;
    const newEatingWindow = originalEatingWindow - hourDelta;

    if (newFastingDuration < MIN_FASTING_DURATION_HOURS || newEatingWindow < MIN_EATING_WINDOW_HOURS) return null;
    if (newFastingDuration > MAX_FASTING_DURATION_HOURS || newEatingWindow > MAX_EATING_WINDOW_HOURS) return null;

    return [{ periodIndex, changes: { fastingDuration: newFastingDuration, eatingWindow: newEatingWindow } }];
  }

  if (barType === 'eating' && edge === 'left') {
    const newFastingDuration = originalFastingDuration + hourDelta;
    const newEatingWindow = originalEatingWindow - hourDelta;

    if (newFastingDuration < MIN_FASTING_DURATION_HOURS || newEatingWindow < MIN_EATING_WINDOW_HOURS) return null;
    if (newFastingDuration > MAX_FASTING_DURATION_HOURS || newEatingWindow > MAX_EATING_WINDOW_HOURS) return null;

    return [{ periodIndex, changes: { fastingDuration: newFastingDuration, eatingWindow: newEatingWindow } }];
  }

  if (barType === 'eating' && edge === 'right') {
    const newEatingWindow = originalEatingWindow + hourDelta;

    if (newEatingWindow < MIN_EATING_WINDOW_HOURS) return null;
    if (newEatingWindow > MAX_EATING_WINDOW_HOURS) return null;

    const newPeriodEndTime = new Date(originalStartTime);
    newPeriodEndTime.setHours(newPeriodEndTime.getHours() + originalFastingDuration + newEatingWindow);

    if (hasNextPeriod) {
      const nextNewFasting = originalNextFastingDuration - hourDelta;
      if (nextNewFasting < MIN_FASTING_DURATION_HOURS) return null;

      return [
        { periodIndex, changes: { eatingWindow: newEatingWindow } },
        {
          periodIndex: nextPeriodIndex,
          changes: {
            startTime: newPeriodEndTime,
            fastingDuration: nextNewFasting,
          },
        },
      ];
    }

    return [{ periodIndex, changes: { eatingWindow: newEatingWindow } }];
  }

  return null;
}

// ============================================================
// MACHINE DEFINITION
// ============================================================

export const planTimelineMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
    input: {} as { periodConfigs: PeriodConfig[] },
  },
  guards: {
    isDragDeltaValid: ({ context, event }) => {
      assertEvent(event, Event.DRAG_MOVE);
      if (!context.dragState || context.chartDimensions.gridWidth <= 0) return false;

      const hourDelta = pixelsToHours(
        event.currentX - context.dragState.startX,
        context.chartDimensions.gridWidth,
      );

      const updates = calculateDragUpdates(context, hourDelta);
      return updates !== null;
    },

    canDeletePeriod: ({ context }) => {
      const nonDeletedCount = context.periodConfigs.filter((c) => !c.deleted).length;
      return nonDeletedCount > MIN_PERIODS;
    },
  },
  actions: {
    // Hover actions
    setHoveredPeriod: assign(({ event }) => {
      assertEvent(event, Event.HOVER_PERIOD);
      return {
        hoveredPeriodIndex: event.periodIndex,
        hoveredGapKey: null,
      };
    }),

    setHoveredGap: assign(({ event }) => {
      assertEvent(event, Event.HOVER_GAP);
      return {
        hoveredPeriodIndex: -1,
        hoveredGapKey: event.gapKey,
      };
    }),

    clearHover: assign(() => ({
      hoveredPeriodIndex: -1,
      hoveredGapKey: null,
    })),

    // Drag actions
    initializeDrag: assign(({ context, event }) => {
      assertEvent(event, Event.DRAG_START);
      const { edge, barType, periodIndex, startX } = event;

      const config = context.periodConfigs[periodIndex];
      if (!config) return {};

      const prevPeriodIdx = findPreviousNonDeletedPeriodIndex(context.periodConfigs, periodIndex);
      const prevConfig = prevPeriodIdx !== -1 ? context.periodConfigs[prevPeriodIdx] : null;
      const nextPeriodIdx = findNextNonDeletedPeriodIndex(context.periodConfigs, periodIndex);
      const nextConfig = nextPeriodIdx !== -1 ? context.periodConfigs[nextPeriodIdx] : null;

      return {
        dragState: {
          isDragging: true,
          edge,
          barType,
          periodIndex,
          startX,
          hourDelta: 0,
          originalStartTime: new Date(config.startTime),
          originalFastingDuration: config.fastingDuration,
          originalEatingWindow: config.eatingWindow,
          prevPeriodIndex: prevPeriodIdx,
          originalPrevFastingDuration: prevConfig?.fastingDuration ?? 0,
          originalPrevEatingWindow: prevConfig?.eatingWindow ?? 0,
          nextPeriodIndex: nextPeriodIdx,
          originalNextStartTime: nextConfig ? new Date(nextConfig.startTime) : null,
          originalNextFastingDuration: nextConfig?.fastingDuration ?? 0,
        },
        hoveredPeriodIndex: periodIndex,
      };
    }),

    updateDragDelta: assign(({ context, event }) => {
      assertEvent(event, Event.DRAG_MOVE);
      if (!context.dragState) return {};

      const hourDelta = pixelsToHours(
        event.currentX - context.dragState.startX,
        context.chartDimensions.gridWidth,
      );

      return {
        dragState: {
          ...context.dragState,
          hourDelta,
        },
      };
    }),

    clearDrag: assign(() => ({
      dragState: null,
    })),

    // Dialog actions
    openEditDialog: assign(({ event }) => {
      assertEvent(event, Event.CLICK_PERIOD);
      return {
        dialogContext: {
          mode: 'edit' as const,
          selectedPeriodIndex: event.periodIndex,
          selectedGapInfo: null,
        },
      };
    }),

    openAddDialog: assign(({ event }) => {
      assertEvent(event, Event.CLICK_GAP);
      return {
        dialogContext: {
          mode: 'add' as const,
          selectedPeriodIndex: null,
          selectedGapInfo: event.gapInfo,
        },
      };
    }),

    closeDialog: assign(() => ({
      dialogContext: null,
    })),

    // Data actions
    updatePeriodConfigs: assign(({ event }) => {
      assertEvent(event, Event.UPDATE_PERIOD_CONFIGS);
      return { periodConfigs: event.periodConfigs };
    }),

    updateChartDimensions: assign(({ event }) => {
      assertEvent(event, Event.UPDATE_CHART_DIMENSIONS);
      return { chartDimensions: event.dimensions };
    }),

    // Emit actions
    emitPeriodUpdated: emit(({ context, event }) => {
      assertEvent(event, Event.DIALOG_SAVE);
      const dialogCtx = context.dialogContext;
      if (!dialogCtx || dialogCtx.mode !== 'edit' || dialogCtx.selectedPeriodIndex === null) {
        throw new Error('Invalid dialog state for period update');
      }

      return {
        type: Emit.PERIOD_UPDATED,
        periodIndex: dialogCtx.selectedPeriodIndex,
        changes: {
          fastingDuration: event.fastingDuration,
          eatingWindow: event.eatingWindow,
          startTime: event.startTime,
        },
      };
    }),

    emitPeriodDeleted: emit(({ context }) => {
      const dialogCtx = context.dialogContext;
      if (!dialogCtx || dialogCtx.selectedPeriodIndex === null) {
        throw new Error('Invalid dialog state for period delete');
      }

      return {
        type: Emit.PERIOD_DELETED,
        periodIndex: dialogCtx.selectedPeriodIndex,
      };
    }),

    emitPeriodAdded: emit(({ context, event }) => {
      assertEvent(event, Event.DIALOG_SAVE);
      const dialogCtx = context.dialogContext;
      if (!dialogCtx || dialogCtx.mode !== 'add' || !dialogCtx.selectedGapInfo) {
        throw new Error('Invalid dialog state for period add');
      }

      return {
        type: Emit.PERIOD_ADDED,
        afterPeriodIndex: dialogCtx.selectedGapInfo.afterPeriodIndex,
        newPeriod: {
          startTime: event.startTime,
          fastingDuration: event.fastingDuration,
          eatingWindow: event.eatingWindow,
          deleted: false,
        },
      };
    }),

    emitDragUpdates: emit(({ context, event }) => {
      assertEvent(event, Event.DRAG_MOVE);
      if (!context.dragState) {
        throw new Error('No drag state for emit');
      }

      const hourDelta = pixelsToHours(
        event.currentX - context.dragState.startX,
        context.chartDimensions.gridWidth,
      );

      const updates = calculateDragUpdates(context, hourDelta);
      return {
        type: Emit.PERIODS_DRAG_UPDATED,
        updates: updates ?? [],
      };
    }),
  },
}).createMachine({
  id: 'planTimeline',
  context: ({ input }) => getInitialContext(input.periodConfigs),
  initial: State.Idle,

  // Global events that can happen from any state
  on: {
    [Event.UPDATE_PERIOD_CONFIGS]: {
      actions: 'updatePeriodConfigs',
    },
    [Event.UPDATE_CHART_DIMENSIONS]: {
      actions: 'updateChartDimensions',
    },
  },

  states: {
    [State.Idle]: {
      entry: 'clearHover',
      on: {
        [Event.HOVER_PERIOD]: {
          target: State.HoveringPeriod,
          actions: 'setHoveredPeriod',
        },
        [Event.HOVER_GAP]: {
          target: State.HoveringGap,
          actions: 'setHoveredGap',
        },
        [Event.CLICK_PERIOD]: {
          target: `${State.DialogOpen}.${DialogState.Edit}`,
          actions: 'openEditDialog',
        },
        [Event.CLICK_GAP]: {
          target: `${State.DialogOpen}.${DialogState.Add}`,
          actions: 'openAddDialog',
        },
        [Event.DRAG_START]: {
          target: State.Dragging,
          actions: 'initializeDrag',
        },
      },
    },

    [State.HoveringPeriod]: {
      on: {
        [Event.HOVER_PERIOD]: {
          actions: 'setHoveredPeriod',
        },
        [Event.HOVER_GAP]: {
          target: State.HoveringGap,
          actions: 'setHoveredGap',
        },
        [Event.HOVER_EXIT]: {
          target: State.Idle,
        },
        [Event.CLICK_PERIOD]: {
          target: `${State.DialogOpen}.${DialogState.Edit}`,
          actions: 'openEditDialog',
        },
        [Event.DRAG_START]: {
          target: State.Dragging,
          actions: 'initializeDrag',
        },
      },
    },

    [State.HoveringGap]: {
      on: {
        [Event.HOVER_PERIOD]: {
          target: State.HoveringPeriod,
          actions: 'setHoveredPeriod',
        },
        [Event.HOVER_GAP]: {
          actions: 'setHoveredGap',
        },
        [Event.HOVER_EXIT]: {
          target: State.Idle,
        },
        [Event.CLICK_GAP]: {
          target: `${State.DialogOpen}.${DialogState.Add}`,
          actions: 'openAddDialog',
        },
      },
    },

    [State.Dragging]: {
      on: {
        [Event.DRAG_MOVE]: {
          guard: 'isDragDeltaValid',
          actions: ['updateDragDelta', 'emitDragUpdates'],
        },
        [Event.DRAG_END]: {
          target: State.Idle,
          actions: 'clearDrag',
        },
      },
    },

    [State.DialogOpen]: {
      initial: DialogState.Edit,
      states: {
        [DialogState.Edit]: {
          on: {
            [Event.DIALOG_SAVE]: {
              target: `#planTimeline.${State.Idle}`,
              actions: ['emitPeriodUpdated', 'closeDialog'],
            },
            [Event.DIALOG_DELETE]: {
              guard: 'canDeletePeriod',
              target: `#planTimeline.${State.Idle}`,
              actions: ['emitPeriodDeleted', 'closeDialog'],
            },
            [Event.DIALOG_CANCEL]: {
              target: `#planTimeline.${State.Idle}`,
              actions: 'closeDialog',
            },
          },
        },
        [DialogState.Add]: {
          on: {
            [Event.DIALOG_SAVE]: {
              target: `#planTimeline.${State.Idle}`,
              actions: ['emitPeriodAdded', 'closeDialog'],
            },
            [Event.DIALOG_CANCEL]: {
              target: `#planTimeline.${State.Idle}`,
              actions: 'closeDialog',
            },
          },
        },
      },
    },
  },
});
