import { runWithUi } from '@/utils/effects/helpers';
import { Match } from 'effect';
import { assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  getCycleProgram,
  updateCycleProgram,
  type GetCycleSuccess,
  type UpdateCycleError,
} from '../../cycle/services/cycle.service';

export enum CycleDetailState {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Updating = 'Updating',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  UPDATE_DATES = 'UPDATE_DATES',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

export enum Emit {
  CYCLE_ERROR = 'CYCLE_ERROR',
  UPDATE_COMPLETE = 'UPDATE_COMPLETE',
}

type EventType =
  | { type: Event.LOAD }
  | { type: Event.UPDATE_DATES; startDate: Date; endDate: Date }
  | { type: Event.ON_SUCCESS; result: GetCycleSuccess }
  | { type: Event.ON_UPDATE_SUCCESS; result: GetCycleSuccess }
  | { type: Event.ON_ERROR; error: string };

export type EmitType = { type: Emit.CYCLE_ERROR; error: string } | { type: Emit.UPDATE_COMPLETE };

type Context = {
  cycleId: string;
  cycle: GetCycleSuccess | null;
  error: string | null;
};

type Input = {
  cycleId: string;
};

function handleUpdateError(error: UpdateCycleError): { type: Event.ON_ERROR; error: string } {
  return Match.value(error).pipe(
    Match.orElse((err) => {
      const errorMessage = 'message' in err && typeof err.message === 'string' ? err.message : String(err);
      return { type: Event.ON_ERROR as const, error: errorMessage };
    }),
  );
}

const loadCycleLogic = fromCallback<EventObject, { cycleId: string }>(({ sendBack, input }) => {
  runWithUi(
    getCycleProgram(input.cycleId),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  );
});

const updateCycleLogic = fromCallback<EventObject, { cycleId: string; startDate: Date; endDate: Date }>(
  ({ sendBack, input }) => {
    runWithUi(
      updateCycleProgram(input.cycleId, input.startDate, input.endDate),
      (result) => {
        sendBack({ type: Event.ON_UPDATE_SUCCESS, result });
      },
      (error) => {
        sendBack(handleUpdateError(error));
      },
    );
  },
);

export const cycleDetailMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
    input: {} as Input,
  },
  actions: {
    setCycleData: assign(({ event }) => {
      if (event.type === Event.ON_SUCCESS || event.type === Event.ON_UPDATE_SUCCESS) {
        return {
          cycle: event.result,
          error: null,
        };
      }
      return {};
    }),
    setError: assign(({ event }) => {
      if (event.type === Event.ON_ERROR) {
        return {
          error: event.error,
        };
      }
      return {};
    }),
    emitCycleError: emit(({ event }) => {
      if (event.type === Event.ON_ERROR) {
        return {
          type: Emit.CYCLE_ERROR,
          error: event.error,
        };
      }
      return { type: Emit.CYCLE_ERROR, error: 'Unknown error' };
    }),
    emitUpdateComplete: emit(() => ({
      type: Emit.UPDATE_COMPLETE,
    })),
  },
  actors: {
    loadCycleActor: loadCycleLogic,
    updateCycleActor: updateCycleLogic,
  },
}).createMachine({
  id: 'cycleDetail',
  context: ({ input }) => ({
    cycleId: input.cycleId,
    cycle: null,
    error: null,
  }),
  initial: CycleDetailState.Idle,
  states: {
    [CycleDetailState.Idle]: {
      on: {
        [Event.LOAD]: CycleDetailState.Loading,
      },
    },
    [CycleDetailState.Loading]: {
      invoke: {
        id: 'loadCycleActor',
        src: 'loadCycleActor',
        input: ({ context }) => ({ cycleId: context.cycleId }),
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData'],
          target: CycleDetailState.Loaded,
        },
        [Event.ON_ERROR]: {
          actions: ['setError', 'emitCycleError'],
          target: CycleDetailState.Error,
        },
      },
    },
    [CycleDetailState.Loaded]: {
      on: {
        [Event.LOAD]: CycleDetailState.Loading,
        [Event.UPDATE_DATES]: CycleDetailState.Updating,
      },
    },
    [CycleDetailState.Updating]: {
      invoke: {
        id: 'updateCycleActor',
        src: 'updateCycleActor',
        input: ({ context, event }) => {
          if (event.type === Event.UPDATE_DATES) {
            return {
              cycleId: context.cycleId,
              startDate: event.startDate,
              endDate: event.endDate,
            };
          }
          return {
            cycleId: context.cycleId,
            startDate: context.cycle!.startDate,
            endDate: context.cycle!.endDate,
          };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['setCycleData', 'emitUpdateComplete'],
          target: CycleDetailState.Loaded,
        },
        [Event.ON_ERROR]: {
          actions: ['emitCycleError'],
          target: CycleDetailState.Loaded,
        },
      },
    },
    [CycleDetailState.Error]: {
      on: {
        [Event.LOAD]: CycleDetailState.Loading,
      },
    },
  },
});
