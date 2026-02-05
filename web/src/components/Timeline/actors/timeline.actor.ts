import { assertEvent, assign, emit, setup } from 'xstate';
import type { ChartDimensions, DragBarType, DragEdge, DragState, PeriodConfig, PeriodUpdate } from '../types';

// Import plan constraints from the plan module
// These define the min/max durations for fasting and eating windows
const MIN_FASTING_DURATION_HOURS = 1;
const MAX_FASTING_DURATION_HOURS = 168; // 7 days
const MIN_EATING_WINDOW_HOURS = 1;
const MAX_EATING_WINDOW_HOURS = 24;

export enum State {
  Idle = 'Idle',
  HoveringPeriod = 'HoveringPeriod',
  Dragging = 'Dragging',
}

export enum Event {
  // Hover events
  HOVER_PERIOD = 'HOVER_PERIOD',
  HOVER_EXIT = 'HOVER_EXIT',

  // Drag events
  DRAG_START = 'DRAG_START',
  DRAG_MOVE = 'DRAG_MOVE',
  DRAG_END = 'DRAG_END',

  // Data events (from parent)
  UPDATE_PERIOD_CONFIGS = 'UPDATE_PERIOD_CONFIGS',
  UPDATE_CHART_DIMENSIONS = 'UPDATE_CHART_DIMENSIONS',
  SET_MIN_START_DATE = 'SET_MIN_START_DATE',
}

export enum Emit {
  PERIODS_DRAG_UPDATED = 'PERIODS_DRAG_UPDATED',
}

export interface Context {
  periodConfigs: PeriodConfig[];
  hoveredPeriodIndex: number; // -1 = none
  dragState: DragState | null;
  chartDimensions: ChartDimensions;
  minPlanStartDate: Date | null; // Earliest allowed start time for the first period
}

export type EventType =
  // Hover events
  | { type: Event.HOVER_PERIOD; periodIndex: number }
  | { type: Event.HOVER_EXIT }

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

  // Data events
  | { type: Event.UPDATE_PERIOD_CONFIGS; periodConfigs: PeriodConfig[] }
  | { type: Event.UPDATE_CHART_DIMENSIONS; dimensions: ChartDimensions }
  | { type: Event.SET_MIN_START_DATE; minStartDate: Date | null };

export type EmitType = { type: Emit.PERIODS_DRAG_UPDATED; updates: PeriodUpdate[] };

function getInitialContext(periodConfigs: PeriodConfig[]): Context {
  return {
    periodConfigs,
    hoveredPeriodIndex: -1,
    dragState: null,
    chartDimensions: {
      width: 0,
      dayLabelWidth: 0,
      gridWidth: 0,
    },
    minPlanStartDate: null,
  };
}

function findPreviousPeriodIndex(periodIndex: number): number | null {
  return periodIndex > 0 ? periodIndex - 1 : null;
}

function findNextPeriodIndex(configs: PeriodConfig[], periodIndex: number): number | null {
  return periodIndex < configs.length - 1 ? periodIndex + 1 : null;
}

function pixelsToHours(pixelDelta: number, gridWidth: number): number {
  if (gridWidth <= 0) return 0;
  const hoursPerPixel = 24 / gridWidth;
  // Round to nearest 15 minutes (0.25 hours)
  return Math.round(pixelDelta * hoursPerPixel * 4) / 4;
}

/**
 * Helper to add fractional hours (supports 15-minute increments) to a date
 */
function addHoursToDate(date: Date, hours: number): Date {
  const newDate = new Date(date);
  const millisToAdd = hours * 60 * 60 * 1000;
  newDate.setTime(newDate.getTime() + millisToAdd);
  return newDate;
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
  const hasPrevPeriod = prevPeriodIndex !== null && originalPrevEatingWindow !== null;

  const nextPeriodIndex = dragState.nextPeriodIndex;
  const originalNextFastingDuration = dragState.originalNextFastingDuration;
  const hasNextPeriod = nextPeriodIndex !== null && originalNextFastingDuration !== null;

  if (barType === 'fasting' && edge === 'left') {
    const newStartTime = addHoursToDate(originalStartTime, hourDelta);
    const newFastingDuration = originalFastingDuration - hourDelta;

    if (newFastingDuration < MIN_FASTING_DURATION_HOURS) return null;
    if (newFastingDuration > MAX_FASTING_DURATION_HOURS) return null;

    // Check minPlanStartDate constraint for the first period (no previous period)
    if (!hasPrevPeriod && context.minPlanStartDate) {
      if (newStartTime < context.minPlanStartDate) return null;
    }

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

    const newPeriodEndTime = addHoursToDate(originalStartTime, originalFastingDuration + newEatingWindow);

    if (hasNextPeriod) {
      const nextNewFasting = originalNextFastingDuration - hourDelta;
      if (nextNewFasting < MIN_FASTING_DURATION_HOURS) return null;
      if (nextNewFasting > MAX_FASTING_DURATION_HOURS) return null;

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

export const timelineMachine = setup({
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

      const hourDelta = pixelsToHours(event.currentX - context.dragState.startX, context.chartDimensions.gridWidth);
      const updates = calculateDragUpdates(context, hourDelta);
      return updates !== null;
    },
  },
  actions: {
    setHoveredPeriod: assign(({ event }) => {
      assertEvent(event, Event.HOVER_PERIOD);
      return {
        hoveredPeriodIndex: event.periodIndex,
      };
    }),

    clearHover: assign(() => ({
      hoveredPeriodIndex: -1,
    })),

    // Drag actions
    initializeDrag: assign(({ context, event }) => {
      assertEvent(event, Event.DRAG_START);
      const { edge, barType, periodIndex, startX } = event;

      const config = context.periodConfigs[periodIndex];
      if (!config) return {};

      const prevPeriodIdx = findPreviousPeriodIndex(periodIndex);
      const prevConfig = prevPeriodIdx !== null ? context.periodConfigs[prevPeriodIdx] : null;
      const nextPeriodIdx = findNextPeriodIndex(context.periodConfigs, periodIndex);
      const nextConfig = nextPeriodIdx !== null ? context.periodConfigs[nextPeriodIdx] : null;

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
          originalPrevFastingDuration: prevConfig?.fastingDuration ?? null,
          originalPrevEatingWindow: prevConfig?.eatingWindow ?? null,
          nextPeriodIndex: nextPeriodIdx,
          originalNextStartTime: nextConfig ? new Date(nextConfig.startTime) : null,
          originalNextFastingDuration: nextConfig?.fastingDuration ?? null,
        },
        hoveredPeriodIndex: periodIndex,
      };
    }),

    updateDragDelta: assign(({ context, event }) => {
      assertEvent(event, Event.DRAG_MOVE);
      if (!context.dragState) return {};

      const hourDelta = pixelsToHours(event.currentX - context.dragState.startX, context.chartDimensions.gridWidth);

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

    // Data actions
    updatePeriodConfigs: assign(({ event }) => {
      assertEvent(event, Event.UPDATE_PERIOD_CONFIGS);
      return { periodConfigs: event.periodConfigs };
    }),

    updateChartDimensions: assign(({ event }) => {
      assertEvent(event, Event.UPDATE_CHART_DIMENSIONS);
      return { chartDimensions: event.dimensions };
    }),

    setMinStartDate: assign(({ event }) => {
      assertEvent(event, Event.SET_MIN_START_DATE);
      return { minPlanStartDate: event.minStartDate };
    }),

    // Emit actions
    emitDragUpdates: emit(({ context, event }) => {
      assertEvent(event, Event.DRAG_MOVE);
      if (!context.dragState) {
        throw new Error('No drag state for emit');
      }

      const hourDelta = pixelsToHours(event.currentX - context.dragState.startX, context.chartDimensions.gridWidth);
      const updates = calculateDragUpdates(context, hourDelta);
      return {
        type: Emit.PERIODS_DRAG_UPDATED,
        updates: updates ?? [],
      };
    }),
  },
}).createMachine({
  id: 'timeline',
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
    [Event.SET_MIN_START_DATE]: {
      actions: 'setMinStartDate',
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
        [Event.HOVER_EXIT]: {
          target: State.Idle,
        },
        [Event.DRAG_START]: {
          target: State.Dragging,
          actions: 'initializeDrag',
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
  },
});
