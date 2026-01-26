import { runWithUi } from '@/utils/effects/helpers';
import { programGetActiveCycle } from '@/views/cycle/services/cycle.service';
import { Effect } from 'effect';
import { assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programGetActivePlan } from '../services/plan.service';

export enum Event {
  CHECK_BLOCKING_RESOURCES = 'CHECK_BLOCKING_RESOURCES',
  RESOURCES_FOUND = 'RESOURCES_FOUND',
  NO_RESOURCES = 'NO_RESOURCES',
  CHECK_ERROR = 'CHECK_ERROR',
  DISMISS = 'DISMISS',
  GO_TO_CYCLE = 'GO_TO_CYCLE',
  GO_TO_PLAN = 'GO_TO_PLAN',
  RETRY = 'RETRY',
}

export enum Emit {
  PROCEED = 'PROCEED',
  NAVIGATE_TO_CYCLE = 'NAVIGATE_TO_CYCLE',
  NAVIGATE_TO_PLAN = 'NAVIGATE_TO_PLAN',
}

export enum State {
  Idle = 'Idle',
  Checking = 'Checking',
  Blocked = 'Blocked',
  Error = 'Error',
}

interface Context {
  hasCycle: boolean;
  hasPlan: boolean;
}

type EventType =
  | { type: Event.CHECK_BLOCKING_RESOURCES }
  | { type: Event.RESOURCES_FOUND; hasCycle: boolean; hasPlan: boolean }
  | { type: Event.NO_RESOURCES }
  | { type: Event.CHECK_ERROR }
  | { type: Event.DISMISS }
  | { type: Event.GO_TO_CYCLE }
  | { type: Event.GO_TO_PLAN }
  | { type: Event.RETRY };

export type EmitType = { type: Emit.PROCEED } | { type: Emit.NAVIGATE_TO_CYCLE } | { type: Emit.NAVIGATE_TO_PLAN };

/**
 * Effect program that checks for blocking resources (active cycle and active plan) in parallel.
 * Returns { hasCycle, hasPlan } indicating which resources exist.
 */
const checkResourcesProgram = Effect.all(
  {
    hasCycle: programGetActiveCycle().pipe(
      Effect.map(() => true),
      Effect.catchTag('NoCycleInProgressError', () => Effect.succeed(false)),
    ),
    hasPlan: programGetActivePlan().pipe(
      Effect.map(() => true),
      Effect.catchTag('NoActivePlanError', () => Effect.succeed(false)),
    ),
  },
  { concurrency: 'unbounded' },
);

const checkResourcesLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    checkResourcesProgram,
    (result) => {
      if (result.hasCycle || result.hasPlan) {
        sendBack({
          type: Event.RESOURCES_FOUND,
          hasCycle: result.hasCycle,
          hasPlan: result.hasPlan,
        });
      } else {
        sendBack({ type: Event.NO_RESOURCES });
      }
    },
    () => {
      // Network error or other - fail closed to prevent overlapping cycles/plans
      sendBack({ type: Event.CHECK_ERROR });
    },
  ),
);

export const blockingResourcesDialogMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitProceed: emit({ type: Emit.PROCEED }),
    emitNavigateToCycle: emit({ type: Emit.NAVIGATE_TO_CYCLE }),
    emitNavigateToPlan: emit({ type: Emit.NAVIGATE_TO_PLAN }),
    updateBlockingResources: assign(({ event }) => {
      if (event.type === Event.RESOURCES_FOUND) {
        return {
          hasCycle: event.hasCycle,
          hasPlan: event.hasPlan,
        };
      }
      return {};
    }),
    resetBlockingResources: assign(() => ({
      hasCycle: false,
      hasPlan: false,
    })),
  },
  actors: {
    checkResourcesLogic,
  },
}).createMachine({
  id: 'blockingResourcesDialog',
  initial: State.Idle,
  context: {
    hasCycle: false,
    hasPlan: false,
  },
  states: {
    [State.Idle]: {
      on: {
        [Event.CHECK_BLOCKING_RESOURCES]: {
          target: State.Checking,
        },
      },
    },
    [State.Checking]: {
      invoke: {
        src: 'checkResourcesLogic',
      },
      on: {
        [Event.RESOURCES_FOUND]: {
          target: State.Blocked,
          actions: 'updateBlockingResources',
        },
        [Event.NO_RESOURCES]: {
          target: State.Idle,
          actions: ['resetBlockingResources', 'emitProceed'],
        },
        [Event.CHECK_ERROR]: {
          target: State.Error,
        },
      },
    },
    [State.Blocked]: {
      on: {
        [Event.DISMISS]: {
          target: State.Idle,
          actions: 'resetBlockingResources',
        },
        [Event.GO_TO_CYCLE]: {
          target: State.Idle,
          actions: ['resetBlockingResources', 'emitNavigateToCycle'],
        },
        [Event.GO_TO_PLAN]: {
          target: State.Idle,
          actions: ['resetBlockingResources', 'emitNavigateToPlan'],
        },
      },
    },
    [State.Error]: {
      on: {
        [Event.RETRY]: {
          target: State.Checking,
        },
        [Event.DISMISS]: {
          target: State.Idle,
          actions: 'resetBlockingResources',
        },
      },
    },
  },
});
