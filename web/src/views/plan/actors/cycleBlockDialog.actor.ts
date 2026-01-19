import { runWithUi } from '@/utils/effects/helpers';
import { programGetActiveCycle } from '@/views/cycle/services/cycle.service';
import { Match } from 'effect';
import { emit, fromCallback, setup, type EventObject } from 'xstate';

export enum Event {
  START_CHECK = 'START_CHECK',
  CYCLE_FOUND = 'CYCLE_FOUND',
  NO_CYCLE = 'NO_CYCLE',
  DISMISS = 'DISMISS',
  GO_TO_CYCLE = 'GO_TO_CYCLE',
}

export enum Emit {
  PROCEED = 'PROCEED',
  NAVIGATE_TO_CYCLE = 'NAVIGATE_TO_CYCLE',
}

export enum State {
  Idle = 'Idle',
  Checking = 'Checking',
  Blocked = 'Blocked',
}

type EventType =
  | { type: Event.START_CHECK }
  | { type: Event.CYCLE_FOUND }
  | { type: Event.NO_CYCLE }
  | { type: Event.DISMISS }
  | { type: Event.GO_TO_CYCLE };

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
          // Network error or other - fail open, allow to proceed
          sendBack({ type: Event.NO_CYCLE });
        }),
      );
    },
  ),
);

export const cycleBlockDialogMachine = setup({
  types: {
    context: {} as object,
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
  context: {},
  states: {
    [State.Idle]: {
      on: {
        [Event.START_CHECK]: {
          target: State.Checking,
        },
      },
    },
    [State.Checking]: {
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
  },
});
