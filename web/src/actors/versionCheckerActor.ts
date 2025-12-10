import { programGetVersion } from '@/services/version/version.service';
import { CURRENT_VERSION, VERSION_CHECK_INITIAL_DELAY_MS, VERSION_CHECK_INTERVAL_MS } from '@/shared/constants/version';
import { runWithUi } from '@/utils/effects/helpers';
import { createActor, emit, fromCallback, setup } from 'xstate';

export enum State {
  IDLE = 'IDLE',
  WAITING_INITIAL_CHECK = 'WAITING_INITIAL_CHECK',
  CHECKING = 'CHECKING',
  UP_TO_DATE = 'UP_TO_DATE',
  UPDATE_AVAILABLE = 'UPDATE_AVAILABLE',
  ERROR = 'ERROR',
}

export enum Event {
  START_POLLING = 'START_POLLING',
  CHECK_VERSION = 'CHECK_VERSION',
  VERSION_MATCHED = 'VERSION_MATCHED',
  VERSION_CHANGED = 'VERSION_CHANGED',
  CHECK_FAILED = 'CHECK_FAILED',
  DISMISS = 'DISMISS',
  RELOAD = 'RELOAD',
}

type EventType =
  | { type: Event.START_POLLING }
  | { type: Event.CHECK_VERSION }
  | { type: Event.VERSION_MATCHED }
  | { type: Event.VERSION_CHANGED; serverVersion: string }
  | { type: Event.CHECK_FAILED; error: string }
  | { type: Event.DISMISS }
  | { type: Event.RELOAD };

export enum Emit {
  UPDATE_AVAILABLE = 'UPDATE_AVAILABLE',
}

export type EmitType = {
  type: Emit.UPDATE_AVAILABLE;
  currentVersion: string;
  serverVersion: string;
};

type Context = {
  currentVersion: string;
  serverVersion: string | null;
  lastCheckTime: number | null;
  error: string | null;
};

export const versionCheckerMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    storeServerVersion: ({ context, event }) => {
      if (event.type === Event.VERSION_CHANGED) {
        context.serverVersion = event.serverVersion;
      }
    },
    updateLastCheckTime: ({ context }) => {
      context.lastCheckTime = Date.now();
    },
    storeError: ({ context, event }) => {
      if (event.type === Event.CHECK_FAILED) {
        context.error = event.error;
      }
    },
    clearError: ({ context }) => {
      context.error = null;
    },
    emitUpdateAvailable: emit(({ context }) => ({
      type: Emit.UPDATE_AVAILABLE,
      currentVersion: context.currentVersion,
      serverVersion: context.serverVersion!,
    })),
    reloadPage: () => {
      window.location.reload();
    },
  },
  actors: {
    checkVersionLogic: fromCallback(({ sendBack }) => {
      runWithUi(
        programGetVersion,
        (response) => {
          if (response.version !== CURRENT_VERSION) {
            sendBack({ type: Event.VERSION_CHANGED, serverVersion: response.version });
          } else {
            sendBack({ type: Event.VERSION_MATCHED });
          }
        },
        (error) => {
          sendBack({ type: Event.CHECK_FAILED, error: String(error) });
        },
      );
    }),
    initialDelayLogic: fromCallback(({ sendBack }) => {
      const timeout = setTimeout(() => {
        sendBack({ type: Event.CHECK_VERSION });
      }, VERSION_CHECK_INITIAL_DELAY_MS);
      return () => clearTimeout(timeout);
    }),
    pollingLogic: fromCallback(({ sendBack }) => {
      const intervalId = setInterval(() => {
        sendBack({ type: Event.CHECK_VERSION });
      }, VERSION_CHECK_INTERVAL_MS);

      return () => clearInterval(intervalId);
    }),
  },
}).createMachine({
  id: 'versionChecker',
  context: {
    currentVersion: CURRENT_VERSION,
    serverVersion: null,
    lastCheckTime: null,
    error: null,
  },
  initial: State.IDLE,
  states: {
    [State.IDLE]: {
      on: {
        [Event.START_POLLING]: {
          target: State.WAITING_INITIAL_CHECK,
        },
      },
    },
    [State.WAITING_INITIAL_CHECK]: {
      invoke: {
        src: 'initialDelayLogic',
      },
      on: {
        [Event.CHECK_VERSION]: {
          target: State.CHECKING,
        },
      },
    },
    [State.CHECKING]: {
      entry: ['clearError'],
      invoke: {
        id: 'checkVersion',
        src: 'checkVersionLogic',
      },
      on: {
        [Event.VERSION_MATCHED]: {
          target: State.UP_TO_DATE,
          actions: ['updateLastCheckTime'],
        },
        [Event.VERSION_CHANGED]: {
          target: State.UPDATE_AVAILABLE,
          actions: ['storeServerVersion', 'updateLastCheckTime', 'emitUpdateAvailable'],
        },
        [Event.CHECK_FAILED]: {
          target: State.ERROR,
          actions: ['storeError', 'updateLastCheckTime'],
        },
      },
    },
    [State.UP_TO_DATE]: {
      invoke: {
        id: 'polling',
        src: 'pollingLogic',
      },
      on: {
        [Event.CHECK_VERSION]: {
          target: State.CHECKING,
        },
      },
    },
    [State.UPDATE_AVAILABLE]: {
      on: {
        [Event.DISMISS]: {
          target: State.UP_TO_DATE,
        },
        [Event.RELOAD]: {
          actions: ['reloadPage'],
        },
      },
    },
    [State.ERROR]: {
      invoke: {
        id: 'polling',
        src: 'pollingLogic',
      },
      on: {
        [Event.CHECK_VERSION]: {
          target: State.CHECKING,
        },
      },
    },
  },
});

export const versionCheckerActor = createActor(versionCheckerMachine);
