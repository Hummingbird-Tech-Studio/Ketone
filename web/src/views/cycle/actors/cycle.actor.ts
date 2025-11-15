import { MILLISECONDS_PER_HOUR, MIN_FASTING_DURATION } from '@/shared/constants';
import { runWithUi } from '@/utils/effects/helpers';
import { addHours } from 'date-fns';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { createCycleProgram, getActiveCycleProgram, type GetCycleSuccess } from '../services/cycle.service';

export enum CycleState {
  Idle = 'Idle',
  Loading = 'Loading',
  Creating = 'Creating',
  InProgress = 'InProgress',
  Finishing = 'Finishing',
  Completed = 'Completed',
}

export enum Event {
  TICK = 'TICK',
  LOAD = 'LOAD',
  CREATE = 'CREATE',
  INCREMENT_DURATION = 'INCREMENT_DURATION',
  DECREASE_DURATION = 'DECREASE_DURATION',
  UPDATE_START_DATE = 'UPDATE_START_DATE',
  UPDATE_END_DATE = 'UPDATE_END_DATE',
  ON_SUCCESS = 'ON_SUCCESS',
  NO_CYCLE_IN_PROGRESS = 'NO_CYCLE_IN_PROGRESS',
  ON_ERROR = 'ON_ERROR',
}

type EventType =
  | { type: Event.TICK }
  | { type: Event.LOAD }
  | { type: Event.CREATE }
  | { type: Event.INCREMENT_DURATION }
  | { type: Event.DECREASE_DURATION; date: Date }
  | { type: Event.UPDATE_START_DATE; date: Date }
  | { type: Event.UPDATE_END_DATE; date: Date }
  | { type: Event.ON_SUCCESS; result: GetCycleSuccess }
  | { type: Event.NO_CYCLE_IN_PROGRESS; message: string }
  | { type: Event.ON_ERROR; error: string };

export enum Emit {
  TICK = 'TICK',
  CYCLE_ERROR = 'CYCLE_ERROR',
}

export type EmitType = { type: Emit.TICK } | { type: Emit.CYCLE_ERROR; error: string };

type CycleMetadata = {
  id: string;
  userId: string;
  status: 'InProgress' | 'Completed';
  createdAt: Date;
  updatedAt: Date;
};

type Context = {
  cycleMetadata: CycleMetadata | null;
  startDate: Date;
  endDate: Date;
  initialDuration: number;
};

function calculateDurationInHours(startDate: Date, endDate: Date): number {
  const diffMs = endDate.getTime() - startDate.getTime();
  const hours = Math.ceil(diffMs / MILLISECONDS_PER_HOUR);
  return Math.max(MIN_FASTING_DURATION, hours);
}

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
      Match.value(error).pipe(
        Match.when({ _tag: 'NoCycleInProgressError' }, (err) => {
          sendBack({ type: Event.NO_CYCLE_IN_PROGRESS, message: err.message });
        }),
        Match.orElse((err) => {
          const errorMessage = 'message' in err && typeof err.message === 'string' ? err.message : String(err);
          sendBack({ type: Event.ON_ERROR, error: errorMessage });
        }),
      );
    },
  );
});

const createCycleLogic = fromCallback<EventObject, { startDate: Date; endDate: Date }>(({ sendBack, input }) => {
  runWithUi(
    createCycleProgram(input.startDate, input.endDate),
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
    onIncrementDuration: assign(({ context }) => {
      const newEnd = addHours(context.endDate, 1);

      return {
        endDate: newEnd,
        initialDuration: calculateDurationInHours(context.startDate, newEnd),
      };
    }),
    onDecrementDuration: assign(({ context, event }) => {
      assertEvent(event, Event.DECREASE_DURATION);
      const candidate = event.date;
      const minEnd = addHours(context.startDate, MIN_FASTING_DURATION);
      const newEnd = candidate < minEnd ? minEnd : candidate;

      return {
        endDate: newEnd,
        initialDuration: calculateDurationInHours(context.startDate, newEnd),
      };
    }),
    onUpdateStartDate: assign(({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      const newStart = event.date;
      const minEnd = addHours(newStart, MIN_FASTING_DURATION);
      const newEnd = new Date(Math.max(context.endDate.getTime(), minEnd.getTime()));

      return {
        startDate: newStart,
        endDate: newEnd,
        initialDuration: calculateDurationInHours(newStart, newEnd),
      };
    }),
    onUpdateEndDate: assign(({ context, event }) => {
      assertEvent(event, Event.UPDATE_END_DATE);
      const candidate = event.date;
      const minEnd = addHours(context.startDate, MIN_FASTING_DURATION);
      const newEnd = candidate < minEnd ? minEnd : candidate;

      return {
        endDate: newEnd,
        initialDuration: calculateDurationInHours(context.startDate, newEnd),
      };
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
      const { id, userId, status, createdAt, updatedAt, startDate, endDate } = event.result;

      return {
        cycleMetadata: { id, userId, status, createdAt, updatedAt },
        startDate,
        endDate,
        initialDuration: calculateDurationInHours(startDate, endDate),
      };
    }),
  },
  guards: {
    isInitialDurationValid: ({ context, event }) => {
      assertEvent(event, Event.DECREASE_DURATION);
      return context.initialDuration > MIN_FASTING_DURATION;
    },
  },
  actors: {
    timerActor: timerLogic,
    cycleActor: cycleLogic,
    createCycleActor: createCycleLogic,
  },
}).createMachine({
  id: 'cycle',
  context: {
    cycleMetadata: null,
    startDate: new Date(),
    endDate: addHours(new Date(), MIN_FASTING_DURATION),
    initialDuration: MIN_FASTING_DURATION,
  },
  initial: CycleState.Idle,
  states: {
    [CycleState.Idle]: {
      on: {
        [Event.LOAD]: CycleState.Loading,
        [Event.CREATE]: CycleState.Creating,
        [Event.INCREMENT_DURATION]: {
          actions: ['onIncrementDuration'],
        },
        [Event.DECREASE_DURATION]: {
          guard: 'isInitialDurationValid',
          actions: ['onDecrementDuration'],
        },
        [Event.UPDATE_START_DATE]: {
          actions: ['onUpdateStartDate'],
        },
        [Event.UPDATE_END_DATE]: {
          actions: ['onUpdateEndDate'],
        },
      },
    },
    [CycleState.Loading]: {
      invoke: {
        id: 'cycleActor',
        src: 'cycleActor',
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData'],
          target: CycleState.InProgress,
        },
        [Event.NO_CYCLE_IN_PROGRESS]: {
          target: CycleState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.Idle,
        },
      },
    },
    [CycleState.Creating]: {
      invoke: {
        id: 'createCycleActor',
        src: 'createCycleActor',
        input: ({ context }) => ({
          startDate: context.startDate,
          endDate: context.endDate,
        }),
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData'],
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
