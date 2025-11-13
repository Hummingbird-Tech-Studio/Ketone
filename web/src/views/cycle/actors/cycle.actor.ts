import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { getActiveCycleProgram, type GetCycleSuccess } from '../services/cycle.service';

export enum CycleState {
  Idle = 'Idle',
  Loading = 'Loading',
  InProgress = 'InProgress',
  Finishing = 'Finishing',
  Completed = 'Completed',
}

export enum Event {
  TICK = 'TICK',
  LOAD = 'LOAD',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

type EventType =
  | { type: Event.TICK }
  | { type: Event.LOAD }
  | { type: Event.ON_SUCCESS; result: GetCycleSuccess }
  | { type: Event.ON_ERROR; error: string };

export enum Emit {
  TICK = 'TICK',
  CYCLE_LOADED = 'CYCLE_LOADED',
  CYCLE_ERROR = 'CYCLE_ERROR',
}

export type EmitType =
  | { type: Emit.TICK }
  | { type: Emit.CYCLE_LOADED; result: GetCycleSuccess }
  | { type: Emit.CYCLE_ERROR; error: string };

type Context = {
  cycleData: GetCycleSuccess | null;
};

const timerLogic = fromCallback(({ sendBack, receive }) => {
  const intervalId = setInterval(() => {
    sendBack({ type: Event.TICK });
  }, 100);

  receive((event) => {
    if (event.type === 'xstate.stop') {
      clearInterval(intervalId);
    }
  });

  return () => {
    clearInterval(intervalId);
  };
});

const cycleLogic = fromCallback<EventObject, void>(({ sendBack }) => {
  runWithUi(
    getActiveCycleProgram(),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  );
});

export const cycleMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitCycleLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_SUCCESS);

      return {
        type: Emit.CYCLE_LOADED,
        result: event.result,
      } as const;
    }),
    emitCycleError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.CYCLE_ERROR,
        error: event.error,
      } as const;
    }),
    setCycleData: assign(({ event }) => {
      assertEvent(event, Event.ON_SUCCESS);
      return {
        cycleData: event.result,
      };
    }),
  },
  actors: {
    timerActor: timerLogic,
    cycleActor: cycleLogic,
  },
}).createMachine({
  id: 'cycle',
  context: {
    cycleData: null,
  },
  initial: CycleState.Idle,
  states: {
    [CycleState.Idle]: {
      on: {
        [Event.LOAD]: CycleState.Loading,
      },
    },
    [CycleState.Loading]: {
      invoke: {
        id: 'cycleActor',
        src: 'cycleActor',
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData', 'emitCycleLoaded'],
          target: CycleState.InProgress,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.Idle,
        },
      },
    },
    [CycleState.InProgress]: {
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: {
          actions: emit({ type: Emit.TICK }),
        },
        [Event.LOAD]: CycleState.Loading,
      },
    },
    [CycleState.Finishing]: {},
    [CycleState.Completed]: {},
  },
});
