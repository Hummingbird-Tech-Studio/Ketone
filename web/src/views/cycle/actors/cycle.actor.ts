import { MILLISECONDS_PER_HOUR, MIN_FASTING_DURATION } from '@/shared/constants';
import { runWithUi } from '@/utils/effects/helpers';
import { formatFullDateTime, formatFullDateTimeWithAt, formatTimeWithMeridiem } from '@/utils/formatting';
import { addHours, startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type ActorRefFrom, type EventObject } from 'xstate';
import { start } from '../domain/domain';
import {
  completeCycleProgram,
  createCycleProgram,
  getActiveCycleProgram,
  updateCycleProgram,
  type GetCycleSuccess,
} from '../services/cycle.service';
import { Event as SchedulerDialogEvent, schedulerDialogMachine } from './schedulerDialog.actor';

const VALIDATION_INFO = {
  START_DATE_IN_FUTURE: {
    summary: 'Start date in future',
  },
  END_DATE_IN_FUTURE: {
    summary: 'End date in future',
  },
  END_DATE_BEFORE_START: {
    summary: 'End date before start date',
  },
  START_DATE_AFTER_END: {
    summary: 'Start date after end date',
  },
  INVALID_DURATION: {
    summary: 'Invalid fasting duration',
  },
  INVALID_DURATION_FOR_END_DATE: {
    summary: 'Invalid fasting duration',
  },
};

export enum CycleState {
  Idle = 'Idle',
  Loading = 'Loading',
  Creating = 'Creating',
  InProgress = 'InProgress',
  Updating = 'Updating',
  ConfirmCompletion = 'ConfirmCompletion',
  Finishing = 'Finishing',
  Completed = 'Completed',
}

export enum Event {
  TICK = 'TICK',
  LOAD = 'LOAD',
  CREATE = 'CREATE',
  INCREMENT_DURATION = 'INCREMENT_DURATION',
  DECREASE_DURATION = 'DECREASE_DURATION',
  REQUEST_START_CHANGE = 'REQUEST_START_CHANGE',
  REQUEST_END_CHANGE = 'REQUEST_END_CHANGE',
  SAVE_EDITED_DATES = 'SAVE_EDITED_DATES',
  CONFIRM_COMPLETION = 'CONFIRM_COMPLETION',
  CANCEL_COMPLETION = 'CANCEL_COMPLETION',
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
  | { type: Event.REQUEST_START_CHANGE; date: Date }
  | { type: Event.REQUEST_END_CHANGE; date: Date }
  | { type: Event.SAVE_EDITED_DATES }
  | { type: Event.CONFIRM_COMPLETION }
  | { type: Event.CANCEL_COMPLETION }
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
  pendingStartDate: Date | null;
  pendingEndDate: Date | null;
  schedulerDialogRef: ActorRefFrom<typeof schedulerDialogMachine>;
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

    case Event.REQUEST_START_CHANGE: {
      const minEnd = addHours(eventDate!, MIN_FASTING_DURATION);
      return {
        startDate: eventDate!,
        endDate: new Date(Math.max(currentEnd.getTime(), minEnd.getTime())),
      };
    }

    case Event.REQUEST_END_CHANGE: {
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
    case Event.REQUEST_START_CHANGE:
    case Event.REQUEST_END_CHANGE:
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

const completeCycleLogic = fromCallback<EventObject, { cycleId: string; startDate: Date; endDate: Date }>(
  ({ sendBack, input }) => {
    runWithUi(
      completeCycleProgram(input.cycleId, input.startDate, input.endDate),
      (result) => {
        sendBack({ type: Event.ON_SUCCESS, result });
      },
      (error) => {
        const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
        sendBack({ type: Event.ON_ERROR, error: errorMessage });
      },
    );
  },
);

/**
 * Checks if a start date is in the future.
 * @param newStartDate - The proposed new start date
 * @returns true if the start date is in the future (blocks the update), false otherwise
 */
function checkIsStartDateInFuture(newStartDate: Date): boolean {
  // Only block dates in the future, allow present and past
  return newStartDate > startOfMinute(new Date());
}

/**
 * Checks if an end date is in the future.
 * @param newEndDate - The proposed new end date
 * @returns true if the end date is in the future (blocks the update), false otherwise
 */
function checkIsEndDateInFuture(newEndDate: Date): boolean {
  // Only block dates in the future, allow present and past
  // Normalize both dates to minute precision to avoid sub-minute comparison issues
  return startOfMinute(newEndDate) > startOfMinute(new Date());
}

/**
 * Checks if the end date would be before or equal to the new start date.
 * @param endDate - The current end date to check against
 * @param newStartDate - The proposed new start date
 * @returns true if end date is before or equal to start date (blocks the update), false otherwise
 */
function checkIsEndDateBeforeStartDate(endDate: Date, newStartDate: Date): boolean {
  // Returns true if end date is before or equal to start date
  return endDate <= newStartDate;
}

/**
 * Checks if the duration between start and end dates is less than the minimum required.
 * @param endDate - The current end date to check against
 * @param newStartDate - The proposed new start date
 * @returns true if duration is positive but less than minimum (blocks the update), false otherwise
 */
function checkHasInvalidDuration(endDate: Date, newStartDate: Date): boolean {
  const durationMs = endDate.getTime() - newStartDate.getTime();
  const durationHours = durationMs / MILLISECONDS_PER_HOUR;

  // Returns true only if duration is positive but less than minimum
  // Negative duration is handled by checkIsEndDateBeforeStartDate
  return durationHours > 0 && durationHours < MIN_FASTING_DURATION;
}

/**
 * Checks if the new end date would be before or equal to the start date.
 * @param startDate - The current start date to check against
 * @param newEndDate - The proposed new end date
 * @returns true if new end date is before or equal to start date (blocks the update), false otherwise
 */
function checkIsStartDateAfterEndDate(startDate: Date, newEndDate: Date): boolean {
  // Returns true if new end date is before or equal to start date
  return newEndDate <= startDate;
}

/**
 * Checks if the duration between start and new end date is less than the minimum required.
 * @param startDate - The current start date to check against
 * @param newEndDate - The proposed new end date
 * @returns true if duration is positive but less than minimum (blocks the update), false otherwise
 */
function checkHasInvalidDurationForEndDate(startDate: Date, newEndDate: Date): boolean {
  const durationMs = newEndDate.getTime() - startDate.getTime();
  const durationHours = durationMs / MILLISECONDS_PER_HOUR;

  // Returns true only if duration is positive but less than minimum
  // Negative duration is handled by checkIsStartDateAfterEndDate
  return durationHours > 0 && durationHours < MIN_FASTING_DURATION;
}

/**
 * Generates the validation message for when a start date is in the future.
 * @param endDate - The current end date to check against
 * @returns Object containing summary and detailed error message
 */
function getStartDateInFutureValidationMessage(endDate: Date): { summary: string; detail: string } {
  const now = new Date();
  const maxValidStartDate = addHours(endDate, -MIN_FASTING_DURATION);

  const detail: string = (() => {
    if (now < maxValidStartDate) {
      // Case A: "No future" restriction is more restrictive
      const formattedNow = formatFullDateTimeWithAt(now);

      return `The start date cannot be in the future. It must be set to a time prior to ${formattedNow}`;
    } else {
      // Case B: "Minimum duration" restriction is more restrictive
      const formattedLimit = formatFullDateTimeWithAt(maxValidStartDate);
      const formattedEndDate = formatTimeWithMeridiem(endDate);

      return `The start date must be set to a time prior to ${formattedLimit} This ensures a minimum ${MIN_FASTING_DURATION}-hour fasting duration with your end date of ${formattedEndDate}`;
    }
  })();

  return {
    summary: VALIDATION_INFO.START_DATE_IN_FUTURE.summary,
    detail,
  };
}

/**
 * Generates the validation message for when an end date is in the future.
 * @returns Object containing summary and detailed error message
 */
function getEndDateInFutureValidationMessage(): { summary: string; detail: string } {
  const now = new Date();
  const formattedNow = formatFullDateTimeWithAt(now);

  return {
    summary: VALIDATION_INFO.END_DATE_IN_FUTURE.summary,
    detail: `The end date cannot be in the future. It must be set to a time prior to ${formattedNow}`,
  };
}

/**
 * Generates the validation message for when the end date is before the start date.
 * @param endDate - The current end date to check against
 * @param newStartDate - The proposed new start date
 * @returns Object containing summary and detailed error message
 */
function getEndDateBeforeStartValidationMessage(
  endDate: Date,
  newStartDate: Date,
): { summary: string; detail: string } {
  const formattedStartDate = formatFullDateTime(newStartDate);
  const formattedEndDate = formatFullDateTime(endDate);

  return {
    summary: VALIDATION_INFO.END_DATE_BEFORE_START.summary,
    detail: `The selected start date (${formattedStartDate}) is after your current end date (${formattedEndDate}). Please adjust your end date first.`,
  };
}

/**
 * Generates the validation message for when the duration is invalid (too short).
 * @param endDate - The current end date to check against
 * @param newStartDate - The proposed new start date
 * @returns Object containing summary and detailed error message
 */
function getInvalidDurationValidationMessage(endDate: Date, newStartDate: Date): { summary: string; detail: string } {
  const durationMs = endDate.getTime() - newStartDate.getTime();
  const durationHours = Math.floor(durationMs / MILLISECONDS_PER_HOUR);
  const durationMinutes = Math.floor((durationMs % MILLISECONDS_PER_HOUR) / 60000);
  const formattedStartDate = formatTimeWithMeridiem(newStartDate);
  const formattedEndDate = formatTimeWithMeridiem(endDate);

  return {
    summary: VALIDATION_INFO.INVALID_DURATION.summary,
    detail: `The selected start date (${formattedStartDate}) would result in a ${durationHours}h ${durationMinutes}m fasting duration with your end date of ${formattedEndDate} The minimum duration is ${MIN_FASTING_DURATION} hour.`,
  };
}

/**
 * Generates the validation message for when the end date is before the start date.
 * @param startDate - The current start date to check against
 * @param newEndDate - The proposed new end date
 * @returns Object containing summary and detailed error message
 */
function getStartDateAfterEndValidationMessage(startDate: Date, newEndDate: Date): { summary: string; detail: string } {
  const formattedStartDate = formatFullDateTime(startDate);
  const formattedEndDate = formatFullDateTime(newEndDate);

  return {
    summary: VALIDATION_INFO.START_DATE_AFTER_END.summary,
    detail: `The selected end date (${formattedEndDate}) is before your current start date (${formattedStartDate}). Please adjust your start date first.`,
  };
}

/**
 * Generates the validation message for when the duration is invalid (too short) for end date update.
 * @param startDate - The current start date to check against
 * @param newEndDate - The proposed new end date
 * @returns Object containing summary and detailed error message
 */
function getInvalidDurationForEndDateValidationMessage(
  startDate: Date,
  newEndDate: Date,
): { summary: string; detail: string } {
  const durationMs = newEndDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / MILLISECONDS_PER_HOUR);
  const durationMinutes = Math.floor((durationMs % MILLISECONDS_PER_HOUR) / 60000);
  const formattedStartDate = formatTimeWithMeridiem(startDate);
  const formattedEndDate = formatTimeWithMeridiem(newEndDate);

  return {
    summary: VALIDATION_INFO.INVALID_DURATION_FOR_END_DATE.summary,
    detail: `The selected end date (${formattedEndDate}) would result in a ${durationHours}h ${durationMinutes}m fasting duration with your start date of ${formattedStartDate} The minimum duration is ${MIN_FASTING_DURATION} hour.`,
  };
}

export const cycleMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setCurrentDates: assign(() => ({
      startDate: new Date(),
      endDate: addHours(new Date(), MIN_FASTING_DURATION),
    })),
    onIncrementDuration: assign(({ context }) => {
      const { startDate, endDate } = calculateNewDates(Event.INCREMENT_DURATION, context.startDate, context.endDate);

      return {
        startDate,
        endDate,
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
      };
    }),
    onUpdateStartDate: assign(({ context, event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);

      const { startDate, endDate } = calculateNewDates(
        Event.REQUEST_START_CHANGE,
        context.startDate,
        context.endDate,
        event.date,
      );

      return {
        startDate,
        endDate,
      };
    }),
    onUpdateEndDate: assign(({ context, event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);

      const { startDate, endDate } = calculateNewDates(
        Event.REQUEST_END_CHANGE,
        context.startDate,
        context.endDate,
        event.date,
      );

      return {
        startDate,
        endDate,
      };
    }),
    emitCycleError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.CYCLE_ERROR,
        error: event.error,
      };
    }),
    emitStartDateInFutureValidation: emit((_, params: { endDate: Date }) => {
      const { summary, detail } = getStartDateInFutureValidationMessage(params.endDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitEndDateInFutureValidation: emit(() => {
      const { summary, detail } = getEndDateInFutureValidationMessage();

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitEndDateBeforeStartValidation: emit((_, params: { endDate: Date; newStartDate: Date }) => {
      const { summary, detail } = getEndDateBeforeStartValidationMessage(params.endDate, params.newStartDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitInvalidDurationValidation: emit((_, params: { endDate: Date; newStartDate: Date }) => {
      const { summary, detail } = getInvalidDurationValidationMessage(params.endDate, params.newStartDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitStartDateAfterEndValidation: emit((_, params: { startDate: Date; newEndDate: Date }) => {
      const { summary, detail } = getStartDateAfterEndValidationMessage(params.startDate, params.newEndDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitInvalidDurationForEndDateValidation: emit((_, params: { startDate: Date; newEndDate: Date }) => {
      const { summary, detail } = getInvalidDurationForEndDateValidationMessage(params.startDate, params.newEndDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitUpdateComplete: emit(() => {
      return {
        type: Emit.UPDATE_COMPLETE,
      };
    }),
    setCycleData: assign(({ event }) => {
      assertEvent(event, Event.ON_SUCCESS);
      const { id, userId, status, createdAt, updatedAt, startDate, endDate } = event.result;

      return {
        cycleMetadata: { id, userId, status, createdAt, updatedAt },
        startDate,
        endDate,
      };
    }),
    initializePendingDates: assign(({ context }) => {
      return {
        pendingStartDate: context.startDate,
        pendingEndDate: new Date(),
      };
    }),
    clearPendingDates: assign(() => {
      return {
        pendingStartDate: null,
        pendingEndDate: null,
      };
    }),
    onEditStartDate: assign(({ event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);

      return {
        pendingStartDate: event.date,
      };
    }),
    onEditEndDate: assign(({ event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);

      return {
        pendingEndDate: event.date,
      };
    }),
    notifyDialogUpdateComplete: ({ context }) => {
      context.schedulerDialogRef.send({ type: SchedulerDialogEvent.UPDATE_COMPLETE });
    },
    notifyDialogValidationFailed: ({ context }) => {
      context.schedulerDialogRef.send({ type: SchedulerDialogEvent.VALIDATION_FAILED });
    },
  },
  guards: {
    isInitialDurationValid: ({ context, event }) => {
      assertEvent(event, Event.DECREASE_DURATION);
      const duration = calculateDurationInHours(context.startDate, context.endDate);
      return duration > MIN_FASTING_DURATION;
    },
    isEndDateBeforeStartDate: ({ event }, params: { endDate: Date }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkIsEndDateBeforeStartDate(params.endDate, event.date);
    },
    hasInvalidDuration: ({ event }, params: { endDate: Date }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkHasInvalidDuration(params.endDate, event.date);
    },
    isStartDateInFuture: ({ event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkIsStartDateInFuture(event.date);
    },
    isEndDateInFuture: ({ event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      return checkIsEndDateInFuture(event.date);
    },
    isStartDateAfterEndDate: ({ event }, params: { startDate: Date }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      return checkIsStartDateAfterEndDate(params.startDate, event.date);
    },
    hasInvalidDurationForEndDate: ({ event }, params: { startDate: Date }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      return checkHasInvalidDurationForEndDate(params.startDate, event.date);
    },
  },
  actors: {
    timerActor: timerLogic,
    cycleActor: cycleLogic,
    createCycleActor: createCycleLogic,
    updateCycleActor: updateCycleLogic,
    completeCycleActor: completeCycleLogic,
    schedulerDialogMachine: schedulerDialogMachine,
  },
}).createMachine({
  id: 'cycle',
  context: ({ spawn }) => ({
    cycleMetadata: null,
    startDate: startOfMinute(new Date()),
    endDate: startOfMinute(addHours(new Date(), MIN_FASTING_DURATION)),
    pendingStartDate: null,
    pendingEndDate: null,
    schedulerDialogRef: spawn('schedulerDialogMachine', {
      id: 'schedulerDialog',
      input: { view: start },
    }),
  }),
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
        [Event.REQUEST_START_CHANGE]: {
          actions: ['onUpdateStartDate'],
        },
        [Event.REQUEST_END_CHANGE]: {
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
      entry: 'setCurrentDates',
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
        [Event.CONFIRM_COMPLETION]: {
          actions: ['initializePendingDates'],
          target: CycleState.ConfirmCompletion,
        },
        [Event.REQUEST_START_CHANGE]: [
          {
            guard: 'isStartDateInFuture',
            actions: [
              {
                type: 'emitStartDateInFutureValidation',
                params: ({ context }) => ({ endDate: context.endDate }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'isEndDateBeforeStartDate',
              params: ({ context }) => ({ endDate: context.endDate }),
            },
            actions: [
              {
                type: 'emitEndDateBeforeStartValidation',
                params: ({ context, event }) => ({
                  endDate: context.endDate,
                  newStartDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'hasInvalidDuration',
              params: ({ context }) => ({ endDate: context.endDate }),
            },
            actions: [
              {
                type: 'emitInvalidDurationValidation',
                params: ({ context, event }) => ({
                  endDate: context.endDate,
                  newStartDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            target: CycleState.Updating,
          },
        ],
        [Event.REQUEST_END_CHANGE]: [
          {
            guard: {
              type: 'isStartDateAfterEndDate',
              params: ({ context }) => ({ startDate: context.startDate }),
            },
            actions: [
              {
                type: 'emitStartDateAfterEndValidation',
                params: ({ context, event }) => ({
                  startDate: context.startDate,
                  newEndDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'hasInvalidDurationForEndDate',
              params: ({ context }) => ({ startDate: context.startDate }),
            },
            actions: [
              {
                type: 'emitInvalidDurationForEndDateValidation',
                params: ({ context, event }) => ({
                  startDate: context.startDate,
                  newEndDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            target: CycleState.Updating,
          },
        ],
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
          actions: ['setCycleData', 'emitUpdateComplete', 'notifyDialogUpdateComplete'],
          target: CycleState.InProgress,
        },
        [Event.ON_ERROR]: {
          actions: ['emitCycleError', 'notifyDialogValidationFailed'],
          target: CycleState.InProgress,
        },
      },
    },
    [CycleState.ConfirmCompletion]: {
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: {
          actions: emit({ type: Emit.TICK }),
        },
        [Event.CANCEL_COMPLETION]: CycleState.InProgress,
        [Event.SAVE_EDITED_DATES]: {
          target: CycleState.Finishing,
        },
        [Event.REQUEST_START_CHANGE]: [
          {
            guard: 'isStartDateInFuture',
            actions: [
              {
                type: 'emitStartDateInFutureValidation',
                params: ({ context }) => ({ endDate: context.pendingEndDate ?? context.endDate }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'isEndDateBeforeStartDate',
              params: ({ context }) => ({ endDate: context.pendingEndDate ?? context.endDate }),
            },
            actions: [
              {
                type: 'emitEndDateBeforeStartValidation',
                params: ({ context, event }) => ({
                  endDate: context.pendingEndDate ?? context.endDate,
                  newStartDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'hasInvalidDuration',
              params: ({ context }) => ({ endDate: context.pendingEndDate ?? context.endDate }),
            },
            actions: [
              {
                type: 'emitInvalidDurationValidation',
                params: ({ context, event }) => ({
                  endDate: context.pendingEndDate ?? context.endDate,
                  newStartDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            actions: ['onEditStartDate', 'emitUpdateComplete', 'notifyDialogUpdateComplete'],
          },
        ],
        [Event.REQUEST_END_CHANGE]: [
          {
            guard: 'isEndDateInFuture',
            actions: [
              {
                type: 'emitEndDateInFutureValidation',
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'isStartDateAfterEndDate',
              params: ({ context }) => ({ startDate: context.pendingStartDate ?? context.startDate }),
            },
            actions: [
              {
                type: 'emitStartDateAfterEndValidation',
                params: ({ context, event }) => ({
                  startDate: context.pendingStartDate ?? context.startDate,
                  newEndDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            guard: {
              type: 'hasInvalidDurationForEndDate',
              params: ({ context }) => ({ startDate: context.pendingStartDate ?? context.startDate }),
            },
            actions: [
              {
                type: 'emitInvalidDurationForEndDateValidation',
                params: ({ context, event }) => ({
                  startDate: context.pendingStartDate ?? context.startDate,
                  newEndDate: event.date,
                }),
              },
              'notifyDialogValidationFailed',
            ],
          },
          {
            actions: ['onEditEndDate', 'emitUpdateComplete', 'notifyDialogUpdateComplete'],
          },
        ],
      },
    },
    [CycleState.Finishing]: {
      invoke: {
        id: 'completeCycleActor',
        src: 'completeCycleActor',
        input: ({ context }) => ({
          cycleId: context.cycleMetadata!.id,
          startDate: context.pendingStartDate!,
          endDate: context.pendingEndDate!,
        }),
      },
      on: {
        [Event.ON_SUCCESS]: {
          actions: ['setCycleData'],
          target: CycleState.Completed,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.ConfirmCompletion,
        },
      },
    },
    [CycleState.Completed]: {},
  },
});
