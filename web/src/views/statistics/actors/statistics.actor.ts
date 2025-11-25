import { runWithUi } from '@/utils/effects/helpers';
import { STATISTICS_PERIOD, type PeriodType } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  getStatisticsProgram,
  type GetStatisticsError,
  type GetStatisticsSuccess,
} from '../services/statistics.service';

/**
 * Statistics State Enum
 */
export enum StatisticsState {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Error = 'Error',
}

/**
 * Event Enum
 */
export enum Event {
  LOAD = 'LOAD',
  CHANGE_PERIOD = 'CHANGE_PERIOD',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

/**
 * Event Types
 */
type EventType =
  | { type: Event.LOAD }
  | { type: Event.CHANGE_PERIOD; period: PeriodType }
  | { type: Event.ON_SUCCESS; result: GetStatisticsSuccess }
  | { type: Event.ON_ERROR; error: string };

/**
 * Emit Enum
 */
export enum Emit {
  STATISTICS_ERROR = 'STATISTICS_ERROR',
}

/**
 * Emit Types
 */
export type EmitType = { type: Emit.STATISTICS_ERROR; error: string };

/**
 * Context Type
 */
type Context = {
  statistics: GetStatisticsSuccess | null;
  selectedPeriod: PeriodType;
  error: string | null;
};

/**
 * Handles errors from statistics operations
 */
function handleStatisticsError(error: GetStatisticsError): { type: Event.ON_ERROR; error: string } {
  return Match.value(error).pipe(
    Match.orElse((err) => {
      const errorMessage = 'message' in err && typeof err.message === 'string' ? err.message : String(err);
      return { type: Event.ON_ERROR as const, error: errorMessage };
    }),
  );
}

/**
 * Load statistics callback actor
 */
const loadStatisticsLogic = fromCallback<EventObject, { period: PeriodType; date: Date }>(({ sendBack, input }) => {
  runWithUi(
    getStatisticsProgram(input.period, input.date),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      sendBack(handleStatisticsError(error));
    },
  );
});

/**
 * Statistics Machine
 */
export const statisticsMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setStatistics: assign(({ event }) => {
      assertEvent(event, Event.ON_SUCCESS);
      return {
        statistics: event.result,
        error: null,
      };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return {
        error: event.error,
      };
    }),
    setPeriod: assign(({ event }) => {
      assertEvent(event, Event.CHANGE_PERIOD);
      return {
        selectedPeriod: event.period,
      };
    }),
    emitStatisticsError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return {
        type: Emit.STATISTICS_ERROR,
        error: event.error,
      };
    }),
  },
  actors: {
    loadStatisticsActor: loadStatisticsLogic,
  },
}).createMachine({
  id: 'statistics',
  context: {
    statistics: null,
    selectedPeriod: STATISTICS_PERIOD.WEEKLY,
    error: null,
  },
  initial: StatisticsState.Idle,
  states: {
    [StatisticsState.Idle]: {
      on: {
        [Event.LOAD]: StatisticsState.Loading,
        [Event.CHANGE_PERIOD]: {
          actions: ['setPeriod'],
        },
      },
    },
    [StatisticsState.Loading]: {
      invoke: {
        id: 'loadStatisticsActor',
        src: 'loadStatisticsActor',
        input: ({ context }) => ({
          period: context.selectedPeriod,
          date: new Date(),
        }),
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setStatistics'],
          target: StatisticsState.Loaded,
        },
        [Event.ON_ERROR]: {
          actions: ['setError', 'emitStatisticsError'],
          target: StatisticsState.Error,
        },
      },
    },
    [StatisticsState.Loaded]: {
      on: {
        [Event.LOAD]: StatisticsState.Loading,
        [Event.CHANGE_PERIOD]: {
          actions: ['setPeriod'],
          target: StatisticsState.Loading,
        },
      },
    },
    [StatisticsState.Error]: {
      on: {
        [Event.LOAD]: StatisticsState.Loading,
        [Event.CHANGE_PERIOD]: {
          actions: ['setPeriod'],
          target: StatisticsState.Loading,
        },
      },
    },
  },
});
