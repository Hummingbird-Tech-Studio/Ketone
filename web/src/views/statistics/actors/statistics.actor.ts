import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { STATISTICS_PERIOD, type PeriodType } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programGetStatistics,
  type GetStatisticsError,
  type GetStatisticsSuccess,
} from '../services/statistics.service';

/**
 * Statistics State Enum
 */
export enum StatisticsState {
  Idle = 'Idle',
  Loading = 'Loading',
  Navigating = 'Navigating',
  Loaded = 'Loaded',
  Error = 'Error',
}

/**
 * Event Enum
 */
export enum Event {
  LOAD = 'LOAD',
  REFRESH = 'REFRESH',
  CHANGE_PERIOD = 'CHANGE_PERIOD',
  NEXT_PERIOD = 'NEXT_PERIOD',
  PREVIOUS_PERIOD = 'PREVIOUS_PERIOD',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

/**
 * Event Types
 */
type EventType =
  | { type: Event.LOAD }
  | { type: Event.REFRESH }
  | { type: Event.CHANGE_PERIOD; period: PeriodType }
  | { type: Event.NEXT_PERIOD }
  | { type: Event.PREVIOUS_PERIOD }
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
  selectedDate: Date;
  error: string | null;
};

/**
 * Returns the initial context values for the statistics machine.
 * Used for both initial context setup and context reset on refresh.
 */
function getInitialContextValues() {
  return {
    statistics: null,
    selectedPeriod: STATISTICS_PERIOD.WEEKLY,
    selectedDate: new Date(),
    error: null,
  };
}

/**
 * Handles errors from statistics operations
 */
function handleStatisticsError(error: GetStatisticsError): { type: Event.ON_ERROR; error: string } {
  return Match.value(error).pipe(
    Match.orElse((err) => ({ type: Event.ON_ERROR as const, error: extractErrorMessage(err) })),
  );
}

/**
 * Load statistics callback actor
 */
const loadStatisticsLogic = fromCallback<EventObject, { period: PeriodType; date: Date }>(({ sendBack, input }) =>
  runWithUi(
    programGetStatistics(input.period, input.date),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      sendBack(handleStatisticsError(error));
    },
  ),
);

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
        selectedDate: new Date(),
      };
    }),
    goToNextPeriod: assign(({ context }) => {
      const newDate = new Date(context.selectedDate);
      if (context.selectedPeriod === STATISTICS_PERIOD.WEEKLY) {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return { selectedDate: newDate };
    }),
    goToPreviousPeriod: assign(({ context }) => {
      const newDate = new Date(context.selectedDate);
      if (context.selectedPeriod === STATISTICS_PERIOD.WEEKLY) {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setMonth(newDate.getMonth() - 1);
      }
      return { selectedDate: newDate };
    }),
    emitStatisticsError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return {
        type: Emit.STATISTICS_ERROR,
        error: event.error,
      };
    }),
    resetContext: assign(() => getInitialContextValues()),
  },
  actors: {
    loadStatisticsActor: loadStatisticsLogic,
  },
}).createMachine({
  id: 'statistics',
  context: getInitialContextValues(),
  initial: StatisticsState.Idle,
  on: {
    [Event.REFRESH]: {
      actions: ['resetContext'],
      target: `.${StatisticsState.Loading}`,
    },
  },
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
          date: context.selectedDate,
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
        [Event.NEXT_PERIOD]: {
          actions: ['goToNextPeriod'],
          target: StatisticsState.Navigating,
        },
        [Event.PREVIOUS_PERIOD]: {
          actions: ['goToPreviousPeriod'],
          target: StatisticsState.Navigating,
        },
      },
    },
    [StatisticsState.Navigating]: {
      invoke: {
        id: 'loadStatisticsActor',
        src: 'loadStatisticsActor',
        input: ({ context }) => ({
          period: context.selectedPeriod,
          date: context.selectedDate,
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
    [StatisticsState.Error]: {
      on: {
        [Event.LOAD]: StatisticsState.Loading,
        [Event.CHANGE_PERIOD]: {
          actions: ['setPeriod'],
          target: StatisticsState.Loading,
        },
        [Event.NEXT_PERIOD]: {
          actions: ['goToNextPeriod'],
          target: StatisticsState.Navigating,
        },
        [Event.PREVIOUS_PERIOD]: {
          actions: ['goToPreviousPeriod'],
          target: StatisticsState.Navigating,
        },
      },
    },
  },
});
