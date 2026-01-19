import { runWithUi } from '@/utils/effects/helpers';
import { programGetActiveCycle } from '@/views/cycle/services/cycle.service';
import { Match } from 'effect';
import { emit, fromCallback, setup, type EventObject } from 'xstate';

export enum Event {
  FETCH_CYCLE = 'FETCH_CYCLE',
  CYCLE_FOUND = 'CYCLE_FOUND',
  NO_CYCLE = 'NO_CYCLE',
  FETCH_CYCLE_ERROR = 'FETCH_CYCLE_ERROR',
  DISMISS = 'DISMISS',
  GO_TO_CYCLE = 'GO_TO_CYCLE',
  RETRY = 'RETRY',
}

export enum Emit {
  PROCEED = 'PROCEED',
  NAVIGATE_TO_CYCLE = 'NAVIGATE_TO_CYCLE',
}

export enum State {
  Idle = 'Idle',
  FetchingCycle = 'FetchingCycle',
  Blocked = 'Blocked',
  Error = 'Error',
}

type EventType =
  | { type: Event.FETCH_CYCLE }
  | { type: Event.CYCLE_FOUND }
  | { type: Event.NO_CYCLE }
  | { type: Event.FETCH_CYCLE_ERROR }
  | { type: Event.DISMISS }
  | { type: Event.GO_TO_CYCLE }
  | { type: Event.RETRY };

export type EmitType = { type: Emit.PROCEED } | { type: Emit.NAVIGATE_TO_CYCLE };

const checkCycleLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    programGetActiveCycle(),
    () => {
      // Success: cycle exists and is in progress
      sendBack({ type: Event.CYCLE_FOUND });
    },
    (error) => {
      Match.value(error).pipe(
        Match.when({ _tag: 'NoCycleInProgressError' }, () => {
          sendBack({ type: Event.NO_CYCLE });
        }),
        Match.orElse(() => {
          // Network error or other - fail closed to prevent overlapping cycles
          sendBack({ type: Event.FETCH_CYCLE_ERROR });
        }),
      );
    },
  ),
);

export const cycleBlockDialogMachine = setup({
  types: {
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitProceed: emit({ type: Emit.PROCEED }),
    emitNavigateToCycle: emit({ type: Emit.NAVIGATE_TO_CYCLE }),
  },
  actors: {
    checkCycleLogic,
  },
}).createMachine({
  id: 'cycleBlockDialog',
  initial: State.Idle,
  states: {
    [State.Idle]: {
      on: {
        [Event.FETCH_CYCLE]: {
          target: State.FetchingCycle,
        },
      },
    },
    [State.FetchingCycle]: {
      invoke: {
        src: 'checkCycleLogic',
      },
      on: {
        [Event.CYCLE_FOUND]: {
          target: State.Blocked,
        },
        [Event.NO_CYCLE]: {
          target: State.Idle,
          actions: 'emitProceed',
        },
        [Event.FETCH_CYCLE_ERROR]: {
          target: State.Error,
        },
      },
    },
    [State.Blocked]: {
      on: {
        [Event.DISMISS]: {
          target: State.Idle,
        },
        [Event.GO_TO_CYCLE]: {
          target: State.Idle,
          actions: 'emitNavigateToCycle',
        },
      },
    },
    [State.Error]: {
      on: {
        [Event.RETRY]: {
          target: State.FetchingCycle,
        },
        [Event.DISMISS]: {
          target: State.Idle,
        },
      },
    },
  },
});
