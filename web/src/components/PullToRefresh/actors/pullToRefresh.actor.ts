import { assign, emit, fromCallback, setup } from 'xstate';

const PULLER_HEIGHT = 40;
const OFFSET_TOP = 20;
const MAX_PULL_DISTANCE = 140;
const ANIMATION_DURATION = 300;

export enum State {
  Idle = 'Idle',
  Tracking = 'Tracking',
  BelowThreshold = 'BelowThreshold',
  AboveThreshold = 'AboveThreshold',
  Refreshing = 'Refreshing',
  AnimatingBack = 'AnimatingBack',
}

export enum Event {
  TOUCH_START = 'TOUCH_START',
  TOUCH_MOVE = 'TOUCH_MOVE',
  TOUCH_END = 'TOUCH_END',
  ANIMATION_DONE = 'ANIMATION_DONE',
  REFRESH_DONE = 'REFRESH_DONE',
}

export enum Emit {
  REFRESH = 'REFRESH',
}

type TouchStartEvent = {
  type: Event.TOUCH_START;
  clientY: number;
  containerRect: { top: number; left: number; width: number };
};

type TouchMoveEvent = {
  type: Event.TOUCH_MOVE;
  clientY: number;
};

type EventType =
  | TouchStartEvent
  | TouchMoveEvent
  | { type: Event.TOUCH_END }
  | { type: Event.ANIMATION_DONE }
  | { type: Event.REFRESH_DONE };

export type EmitType = { type: Emit.REFRESH };

export type Context = {
  startY: number;
  pullDistance: number;
  pullPosition: number;
  pullRatio: number;
  positionCSS: Record<string, string>;
  showSpinner: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculatePullValues(clientY: number, startY: number) {
  const diff = clientY - startY;
  const distance = clamp(diff, 0, MAX_PULL_DISTANCE);
  const position = distance - PULLER_HEIGHT;
  const ratio = clamp(distance / (OFFSET_TOP + PULLER_HEIGHT), 0, 1);

  return { distance, position, ratio };
}

const animationTimerLogic = fromCallback<{ type: Event.ANIMATION_DONE }>(({ sendBack }) => {
  const timerId = setTimeout(() => {
    sendBack({ type: Event.ANIMATION_DONE });
  }, ANIMATION_DURATION);

  return () => {
    clearTimeout(timerId);
  };
});

export const pullToRefreshMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    initializeTracking: assign(({ event }) => {
      const e = event as TouchStartEvent;
      return {
        startY: e.clientY,
        pullDistance: 0,
        pullPosition: -PULLER_HEIGHT,
        pullRatio: 0,
        positionCSS: {
          top: `${e.containerRect.top}px`,
          left: `${e.containerRect.left}px`,
          width: `${e.containerRect.width}px`,
        },
      };
    }),
    updatePullDistance: assign(({ context, event }) => {
      const e = event as TouchMoveEvent;
      const { distance, position, ratio } = calculatePullValues(e.clientY, context.startY);

      return {
        pullDistance: distance,
        pullPosition: position,
        pullRatio: ratio,
      };
    }),
    setRefreshingPosition: assign({
      pullPosition: OFFSET_TOP,
      showSpinner: true,
    }),
    resetToHidden: assign({
      pullPosition: -PULLER_HEIGHT,
      pullRatio: 0,
      pullDistance: 0,
    }),
    clearSpinner: assign({
      showSpinner: false,
    }),
    emitRefresh: emit({ type: Emit.REFRESH }),
  },
  guards: {
    isAtTop: () => window.scrollY === 0,
    isPullingDown: ({ event }) => {
      const e = event as TouchMoveEvent;
      return e.clientY > 0;
    },
    isAboveThreshold: ({ context }) => context.pullPosition > OFFSET_TOP,
    isBelowThreshold: ({ context }) => context.pullPosition <= OFFSET_TOP,
    isScrolledAway: () => window.scrollY !== 0,
  },
  actors: {
    animationTimer: animationTimerLogic,
  },
}).createMachine({
  id: 'pullToRefresh',
  initial: State.Idle,
  context: {
    startY: 0,
    pullDistance: 0,
    pullPosition: -PULLER_HEIGHT,
    pullRatio: 0,
    positionCSS: {},
    showSpinner: false,
  },
  states: {
    [State.Idle]: {
      on: {
        [Event.TOUCH_START]: {
          guard: 'isAtTop',
          actions: 'initializeTracking',
          target: State.Tracking,
        },
      },
    },
    [State.Tracking]: {
      initial: State.BelowThreshold,
      on: {
        [Event.TOUCH_MOVE]: [
          {
            guard: 'isScrolledAway',
            target: State.Idle,
          },
        ],
      },
      states: {
        [State.BelowThreshold]: {
          on: {
            [Event.TOUCH_MOVE]: [
              {
                guard: 'isAboveThreshold',
                actions: 'updatePullDistance',
                target: State.AboveThreshold,
              },
              {
                actions: 'updatePullDistance',
              },
            ],
            [Event.TOUCH_END]: `#pullToRefresh.${State.AnimatingBack}`,
          },
        },
        [State.AboveThreshold]: {
          on: {
            [Event.TOUCH_MOVE]: [
              {
                guard: 'isBelowThreshold',
                actions: 'updatePullDistance',
                target: State.BelowThreshold,
              },
              {
                actions: 'updatePullDistance',
              },
            ],
            [Event.TOUCH_END]: `#pullToRefresh.${State.Refreshing}`,
          },
        },
      },
    },
    [State.Refreshing]: {
      entry: ['setRefreshingPosition', 'emitRefresh'],
      on: {
        [Event.REFRESH_DONE]: State.AnimatingBack,
      },
    },
    [State.AnimatingBack]: {
      entry: 'resetToHidden',
      invoke: {
        id: 'animationTimer',
        src: 'animationTimer',
        onDone: {
          target: State.Idle,
          actions: 'clearSpinner',
        },
      },
      on: {
        [Event.ANIMATION_DONE]: {
          target: State.Idle,
          actions: 'clearSpinner',
        },
      },
    },
  },
});
