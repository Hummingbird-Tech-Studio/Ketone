import { MILLISECONDS_PER_HOUR, MIN_FASTING_DURATION } from '@/shared/constants';
import { runWithUi } from '@/utils/effects/helpers';
import { addHours, format, startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  createCycleProgram,
  getActiveCycleProgram,
  updateCycleProgram,
  type GetCycleSuccess,
} from '../services/cycle.service';

export const VALIDATION_INFO = {
  START_DATE_IN_FUTURE: {
    summary: 'Start date in future',
    detail: 'Start date must be in the past.',
  },
  END_DATE_BEFORE_START: {
    summary: 'End date before start date',
    detail: 'The end date must be after the start date.',
  },
  INVALID_DURATION: {
    summary: 'Invalid fasting duration',
    detail: 'The duration must be at least 1 hour.',
  },
};

export enum CycleState {
  Idle = 'Idle',
  Loading = 'Loading',
  Creating = 'Creating',
  InProgress = 'InProgress',
  Updating = 'Updating',
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
  VALIDATION_INFO = 'VALIDATION_INFO',
  UPDATE_COMPLETE = 'UPDATE_COMPLETE',
}

export type EmitType =
  | { type: Emit.TICK }
  | { type: Emit.CYCLE_ERROR; error: string }
  | { type: Emit.VALIDATION_INFO; summary: string; detail: string }
  | { type: Emit.UPDATE_COMPLETE };

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

function calculateNewDates(
  eventType: Event,
  currentStart: Date,
  currentEnd: Date,
  eventDate?: Date,
): { startDate: Date; endDate: Date } {
  switch (eventType) {
    case Event.INCREMENT_DURATION:
      return {
        startDate: currentStart,
        endDate: addHours(currentEnd, 1),
      };

    case Event.DECREASE_DURATION: {
      const minEnd = addHours(currentStart, MIN_FASTING_DURATION);
      return {
        startDate: currentStart,
        endDate: eventDate! < minEnd ? minEnd : eventDate!,
      };
    }

    case Event.UPDATE_START_DATE: {
      const minEnd = addHours(eventDate!, MIN_FASTING_DURATION);
      return {
        startDate: eventDate!,
        endDate: new Date(Math.max(currentEnd.getTime(), minEnd.getTime())),
      };
    }

    case Event.UPDATE_END_DATE: {
      const minEnd = addHours(currentStart, MIN_FASTING_DURATION);
      return {
        startDate: currentStart,
        endDate: eventDate! < minEnd ? minEnd : eventDate!,
      };
    }

    default:
      return { startDate: currentStart, endDate: currentEnd };
  }
}

type UpdateCycleInput = {
  cycleId: string;
  eventType: Event;
  currentStart: Date;
  currentEnd: Date;
  eventDate?: Date;
};

function buildUpdateCycleInput(context: Context, event: EventType): UpdateCycleInput {
  const base = {
    cycleId: context.cycleMetadata!.id,
    eventType: event.type,
    currentStart: context.startDate,
    currentEnd: context.endDate,
  };

  switch (event.type) {
    case Event.DECREASE_DURATION:
    case Event.UPDATE_START_DATE:
    case Event.UPDATE_END_DATE:
      return { ...base, eventDate: event.date };
    default:
      return base;
  }
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

const updateCycleLogic = fromCallback<EventObject, UpdateCycleInput>(({ sendBack, input }) => {
  const { startDate, endDate } = calculateNewDates(
    input.eventType,
    input.currentStart,
    input.currentEnd,
    input.eventDate,
  );

  runWithUi(
    updateCycleProgram(input.cycleId, startDate, endDate),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  );
});

/**
 * Checks if a start date is in the future.
 * @param newStartDate - The proposed new start date
 * @returns true if the start date is in the future (blocks the update), false otherwise
 */
export function checkIsStartDateInFuture(newStartDate: Date): boolean {
  // Only block dates in the future, allow present and past
  return newStartDate > startOfMinute(new Date());
}

/**
 * Checks if the end date would be before or equal to the new start date.
 * @param context - The cycle context containing the current end date
 * @param newStartDate - The proposed new start date
 * @returns true if end date is before or equal to start date (blocks the update), false otherwise
 */
export function checkIsEndDateBeforeStartDate(context: Context, newStartDate: Date): boolean {
  // Returns true if end date is before or equal to start date
  return context.endDate <= newStartDate;
}

/**
 * Checks if the duration between start and end dates is less than the minimum required.
 * @param context - The cycle context containing the current end date
 * @param newStartDate - The proposed new start date
 * @returns true if duration is positive but less than minimum (blocks the update), false otherwise
 */
export function checkHasInvalidDuration(context: Context, newStartDate: Date): boolean {
  const durationMs = context.endDate.getTime() - newStartDate.getTime();
  const durationHours = durationMs / MILLISECONDS_PER_HOUR;

  // Returns true only if duration is positive but less than minimum
  // Negative duration is handled by checkIsEndDateBeforeStartDate
  return durationHours > 0 && durationHours < MIN_FASTING_DURATION;
}

/**
 * Generates the validation message for when a start date is in the future.
 * @param context - The cycle context containing the current end date
 * @returns Object containing summary and detailed error message
 */
export function getStartDateInFutureValidationMessage(context: Context): { summary: string; detail: string } {
  const now = new Date();
  const maxValidStartDate = addHours(context.endDate, -MIN_FASTING_DURATION);

  let detail: string;

  if (now < maxValidStartDate) {
    // Case A: "No future" restriction is more restrictive
    const formattedNow = format(now, "MMMM d, yyyy, 'at' h:mm a").replace(' AM', ' a.m.').replace(' PM', ' p.m.');

    detail = `The start date cannot be in the future. It must be set to a time prior to ${formattedNow}`;
  } else {
    // Case B: "Minimum duration" restriction is more restrictive
    const formattedLimit = format(maxValidStartDate, "MMMM d, yyyy, 'at' h:mm a")
      .replace(' AM', ' a.m.')
      .replace(' PM', ' p.m.');

    const formattedEndDate = format(context.endDate, 'h:mm a');

    detail = `The start date must be set to a time prior to ${formattedLimit} This ensures a minimum ${MIN_FASTING_DURATION}-hour fasting duration with your end date of ${formattedEndDate}.`;
  }

  return {
    summary: VALIDATION_INFO.START_DATE_IN_FUTURE.summary,
    detail,
  };
}

/**
 * Generates the validation message for when the end date is before the start date.
 * @param context - The cycle context containing the current end date
 * @param newStartDate - The proposed new start date
 * @returns Object containing summary and detailed error message
 */
export function getEndDateBeforeStartValidationMessage(
  context: Context,
  newStartDate: Date,
): { summary: string; detail: string } {
  const formattedStartDate = format(newStartDate, 'MMMM d, yyyy h:mm a');
  const formattedEndDate = format(context.endDate, 'MMMM d, yyyy h:mm a');

  return {
    summary: VALIDATION_INFO.END_DATE_BEFORE_START.summary,
    detail: `The selected start date (${formattedStartDate}) is after your current end date (${formattedEndDate}). Please adjust your end date first.`,
  };
}

/**
 * Generates the validation message for when the duration is invalid (too short).
 * @param context - The cycle context containing the current end date
 * @param newStartDate - The proposed new start date
 * @returns Object containing summary and detailed error message
 */
export function getInvalidDurationValidationMessage(
  context: Context,
  newStartDate: Date,
): { summary: string; detail: string } {
  const durationMs = context.endDate.getTime() - newStartDate.getTime();
  const durationHours = Math.floor(durationMs / MILLISECONDS_PER_HOUR);
  const durationMinutes = Math.floor((durationMs % MILLISECONDS_PER_HOUR) / 60000);
  const formattedStartDate = format(newStartDate, 'h:mm a');
  const formattedEndDate = format(context.endDate, 'h:mm a');

  return {
    summary: VALIDATION_INFO.INVALID_DURATION.summary,
    detail: `The selected start date (${formattedStartDate}) would result in a ${durationHours}h ${durationMinutes}m fasting duration with your end date of ${formattedEndDate}. The minimum duration is ${MIN_FASTING_DURATION} hour.`,
  };
}

export const cycleMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    onIncrementDuration: assign(({ context }) => {
      const { startDate, endDate } = calculateNewDates(Event.INCREMENT_DURATION, context.startDate, context.endDate);

      return {
        startDate,
        endDate,
        initialDuration: calculateDurationInHours(startDate, endDate),
      };
    }),
    onDecrementDuration: assign(({ context, event }) => {
      assertEvent(event, Event.DECREASE_DURATION);

      const { startDate, endDate } = calculateNewDates(
        Event.DECREASE_DURATION,
        context.startDate,
        context.endDate,
        event.date,
      );

      return {
        startDate,
        endDate,
        initialDuration: calculateDurationInHours(startDate, endDate),
      };
    }),
    onUpdateStartDate: assign(({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);

      const { startDate, endDate } = calculateNewDates(
        Event.UPDATE_START_DATE,
        context.startDate,
        context.endDate,
        event.date,
      );

      return {
        startDate,
        endDate,
        initialDuration: calculateDurationInHours(startDate, endDate),
      };
    }),
    onUpdateEndDate: assign(({ context, event }) => {
      assertEvent(event, Event.UPDATE_END_DATE);

      const { startDate, endDate } = calculateNewDates(
        Event.UPDATE_END_DATE,
        context.startDate,
        context.endDate,
        event.date,
      );

      return {
        startDate,
        endDate,
        initialDuration: calculateDurationInHours(startDate, endDate),
      };
    }),
    emitCycleError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.CYCLE_ERROR,
        error: event.error,
      } as const;
    }),
    emitStartDateInFutureValidation: emit(({ context }) => {
      const { summary, detail } = getStartDateInFutureValidationMessage(context);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      } as const;
    }),
    emitEndDateBeforeStartValidation: emit(({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      const { summary, detail } = getEndDateBeforeStartValidationMessage(context, event.date);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      } as const;
    }),
    emitInvalidDurationValidation: emit(({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      const { summary, detail } = getInvalidDurationValidationMessage(context, event.date);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      } as const;
    }),
    emitUpdateComplete: emit(() => {
      return {
        type: Emit.UPDATE_COMPLETE,
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
    isEndDateBeforeStartDate: ({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      return checkIsEndDateBeforeStartDate(context, event.date);
    },
    hasInvalidDuration: ({ context, event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      return checkHasInvalidDuration(context, event.date);
    },
    isStartDateInFuture: ({ event }) => {
      assertEvent(event, Event.UPDATE_START_DATE);
      return checkIsStartDateInFuture(event.date);
    },
  },
  actors: {
    timerActor: timerLogic,
    cycleActor: cycleLogic,
    createCycleActor: createCycleLogic,
    updateCycleActor: updateCycleLogic,
  },
}).createMachine({
  id: 'cycle',
  context: {
    cycleMetadata: null,
    startDate: startOfMinute(new Date()),
    endDate: startOfMinute(addHours(new Date(), MIN_FASTING_DURATION)),
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
        [Event.INCREMENT_DURATION]: CycleState.Updating,
        [Event.DECREASE_DURATION]: {
          guard: 'isInitialDurationValid',
          target: CycleState.Updating,
        },
        [Event.UPDATE_START_DATE]: [
          {
            guard: 'isStartDateInFuture',
            actions: ['emitStartDateInFutureValidation'],
          },
          {
            guard: 'isEndDateBeforeStartDate',
            actions: ['emitEndDateBeforeStartValidation'],
          },
          {
            guard: 'hasInvalidDuration',
            actions: ['emitInvalidDurationValidation'],
          },
          {
            target: CycleState.Updating,
          },
        ],
        [Event.UPDATE_END_DATE]: CycleState.Updating,
      },
    },
    [CycleState.Updating]: {
      invoke: [
        {
          id: 'timerActor',
          src: 'timerActor',
        },
        {
          id: 'updateCycleActor',
          src: 'updateCycleActor',
          input: ({ context, event }) => buildUpdateCycleInput(context, event),
        },
      ],
      on: {
        [Event.TICK]: {
          actions: emit({ type: Emit.TICK }),
        },
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData', 'emitUpdateComplete'],
          target: CycleState.InProgress,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.InProgress,
        },
      },
    },
    [CycleState.Finishing]: {},
    [CycleState.Completed]: {},
  },
});
