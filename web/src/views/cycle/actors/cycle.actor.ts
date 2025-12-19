import { runWithUi } from '@/utils/effects/helpers';
import { formatFullDateTime, formatFullDateTimeWithAt } from '@/utils/formatting';
import { addHours, startOfMinute } from 'date-fns';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type ActorRefFrom, type EventObject } from 'xstate';
import { start } from '../domain/domain';
import {
  completeCycleProgram,
  createCycleProgram,
  getActiveCycleProgram,
  updateCycleProgram,
  updateCycleNotesProgram,
  updateCycleFeelingsProgram,
  type CompleteCycleError,
  type CreateCycleError,
  type GetCycleSuccess,
  type UpdateCycleError,
} from '../services/cycle.service';
import { Event as SchedulerDialogEvent, schedulerDialogMachine } from './schedulerDialog.actor';

const DEFAULT_FASTING_DURATION = 1; // in hours

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
  CYCLE_OVERLAP: {
    summary: 'Cycle overlaps with previous cycle',
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
  SavingNotes = 'SavingNotes',
  SavingFeelings = 'SavingFeelings',
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
  ON_OVERLAP_ERROR = 'ON_OVERLAP_ERROR',
  SAVE_NOTES = 'SAVE_NOTES',
  ON_NOTES_SAVED = 'ON_NOTES_SAVED',
  SAVE_FEELINGS = 'SAVE_FEELINGS',
  ON_FEELINGS_SAVED = 'ON_FEELINGS_SAVED',
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
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_OVERLAP_ERROR; newStartDate: Date; lastCompletedEndDate: Date }
  | { type: Event.SAVE_NOTES; notes: string }
  | { type: Event.ON_NOTES_SAVED; result: GetCycleSuccess }
  | { type: Event.SAVE_FEELINGS; feelings: string[] }
  | { type: Event.ON_FEELINGS_SAVED; result: GetCycleSuccess };

export enum Emit {
  TICK = 'TICK',
  CYCLE_ERROR = 'CYCLE_ERROR',
  VALIDATION_INFO = 'VALIDATION_INFO',
  UPDATE_COMPLETE = 'UPDATE_COMPLETE',
  NOTES_SAVED = 'NOTES_SAVED',
  FEELINGS_SAVED = 'FEELINGS_SAVED',
}

export type EmitType =
  | { type: Emit.TICK }
  | { type: Emit.CYCLE_ERROR; error: string }
  | { type: Emit.VALIDATION_INFO; summary: string; detail: string }
  | { type: Emit.UPDATE_COMPLETE }
  | { type: Emit.NOTES_SAVED }
  | { type: Emit.FEELINGS_SAVED };

export type CycleMetadata = {
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
  notes: string | null;
  feelings: string[] | null;
  pendingStartDate: Date | null;
  pendingEndDate: Date | null;
  schedulerDialogRef: ActorRefFrom<typeof schedulerDialogMachine>;
};

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

    case Event.DECREASE_DURATION:
      return {
        startDate: currentStart,
        endDate: eventDate!,
      };

    case Event.REQUEST_START_CHANGE:
      return {
        startDate: eventDate!,
        endDate: currentEnd,
      };

    case Event.REQUEST_END_CHANGE:
      return {
        startDate: currentStart,
        endDate: eventDate!,
      };

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

/**
 * Handles errors from cycle operations, detecting CycleOverlapError and extracting dates.
 * @param error - The error from the cycle operation
 * @param fallbackStartDate - The start date to use if not present in the error
 * @returns An event to send back with the appropriate error information
 */
function handleCycleError(error: CreateCycleError | UpdateCycleError | CompleteCycleError, fallbackStartDate: Date) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'CycleOverlapError' }, (err) => {
      return {
        type: Event.ON_OVERLAP_ERROR as const,
        newStartDate: err.newStartDate ?? fallbackStartDate,
        lastCompletedEndDate: err.lastCompletedEndDate!,
      };
    }),
    Match.orElse((err) => {
      const errorMessage = 'message' in err && typeof err.message === 'string' ? err.message : String(err);
      return { type: Event.ON_ERROR as const, error: errorMessage };
    }),
  );
}

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
      sendBack(handleCycleError(error, input.startDate));
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
      sendBack(handleCycleError(error, startDate));
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
        sendBack(handleCycleError(error, input.startDate));
      },
    );
  },
);

const updateNotesLogic = fromCallback<EventObject, { cycleId: string; notes: string }>(({ sendBack, input }) => {
  runWithUi(
    updateCycleNotesProgram(input.cycleId, input.notes),
    (result) => {
      sendBack({ type: Event.ON_NOTES_SAVED, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  );
});

const updateFeelingsLogic = fromCallback<EventObject, { cycleId: string; feelings: string[] }>(
  ({ sendBack, input }) => {
    runWithUi(
      updateCycleFeelingsProgram(input.cycleId, input.feelings),
      (result) => {
        sendBack({ type: Event.ON_FEELINGS_SAVED, result });
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
  return newStartDate > new Date();
}

/**
 * Checks if an end date is in the future.
 * @param newEndDate - The proposed new end date
 * @returns true if the end date is in the future (blocks the update), false otherwise
 */
function checkIsEndDateInFuture(newEndDate: Date): boolean {
  return newEndDate > new Date();
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
 * Generates the validation message for when a start date is in the future.
 * @returns Object containing summary and detailed error message
 */
function getStartDateInFutureValidationMessage(): { summary: string; detail: string } {
  const now = new Date();
  const formattedNow = formatFullDateTimeWithAt(now);

  return {
    summary: VALIDATION_INFO.START_DATE_IN_FUTURE.summary,
    detail: `The start date cannot be in the future. It must be set to a time prior to ${formattedNow}`,
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
 * Generates the validation message for when a cycle overlaps with the last completed cycle.
 * @param newStartDate - The date being attempted for the new cycle
 * @param lastCompletedEndDate - The end date of the last completed cycle that conflicts
 * @returns Object containing summary and detailed error message
 */
function getCycleOverlapValidationMessage(
  newStartDate: Date,
  lastCompletedEndDate: Date,
): { summary: string; detail: string } {
  const formattedNewStartDate = formatFullDateTime(newStartDate);
  const formattedLastEndDate = formatFullDateTime(lastCompletedEndDate);

  return {
    summary: VALIDATION_INFO.CYCLE_OVERLAP.summary,
    detail: `The selected start date (${formattedNewStartDate}) overlaps with your previous cycle, which ended at ${formattedLastEndDate} Please select a start date after ${formattedLastEndDate}`,
  };
}

export const cycleMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setCurrentDates: assign(({ context }) => {
      const now = new Date();
      const durationMs = context.endDate.getTime() - context.startDate.getTime();

      return {
        startDate: now,
        endDate: new Date(now.getTime() + durationMs),
      };
    }),
    setCurrentDatesWithFixedHour: assign(() => {
      const now = new Date();

      return {
        startDate: now,
        endDate: addHours(now, DEFAULT_FASTING_DURATION),
      };
    }),
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
    emitStartDateInFutureValidation: emit(() => {
      const { summary, detail } = getStartDateInFutureValidationMessage();

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
    emitStartDateAfterEndValidation: emit((_, params: { startDate: Date; newEndDate: Date }) => {
      const { summary, detail } = getStartDateAfterEndValidationMessage(params.startDate, params.newEndDate);

      return {
        type: Emit.VALIDATION_INFO,
        summary,
        detail,
      };
    }),
    emitCycleOverlapValidation: emit((_, params: { newStartDate: Date; lastCompletedEndDate: Date }) => {
      const { summary, detail } = getCycleOverlapValidationMessage(params.newStartDate, params.lastCompletedEndDate);

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
      const { id, userId, status, createdAt, updatedAt, startDate, endDate, notes, feelings } = event.result;

      return {
        cycleMetadata: { id, userId, status, createdAt, updatedAt },
        startDate,
        endDate,
        notes,
        feelings: [...feelings],
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
    setNotes: assign(({ event }) => {
      assertEvent(event, Event.ON_NOTES_SAVED);
      return {
        notes: event.result.notes,
      };
    }),
    emitNotesSaved: emit(() => ({
      type: Emit.NOTES_SAVED,
    })),
    setFeelings: assign(({ event }) => {
      assertEvent(event, Event.ON_FEELINGS_SAVED);
      return {
        feelings: [...event.result.feelings],
      };
    }),
    emitFeelingsSaved: emit(() => ({
      type: Emit.FEELINGS_SAVED,
    })),
  },
  guards: {
    canDecrementDuration: ({ context, event }) => {
      assertEvent(event, Event.DECREASE_DURATION);
      // Allow decrementing as long as the new end date is after the start date
      return event.date > context.startDate;
    },
    isEndDateBeforeStartDate: ({ event }, params: { endDate: Date }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkIsEndDateBeforeStartDate(params.endDate, event.date);
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
    isCycleCompleted: ({ context }) => {
      return context.cycleMetadata?.status === 'Completed';
    },
  },
  actors: {
    timerActor: timerLogic,
    cycleActor: cycleLogic,
    createCycleActor: createCycleLogic,
    updateCycleActor: updateCycleLogic,
    completeCycleActor: completeCycleLogic,
    updateNotesActor: updateNotesLogic,
    updateFeelingsActor: updateFeelingsLogic,
    schedulerDialogMachine: schedulerDialogMachine,
  },
}).createMachine({
  id: 'cycle',
  context: ({ spawn }) => ({
    cycleMetadata: null,
    startDate: startOfMinute(new Date()),
    endDate: startOfMinute(addHours(new Date(), DEFAULT_FASTING_DURATION)),
    notes: null,
    feelings: null,
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
        [Event.CREATE]: {
          actions: ['setCurrentDates'],
          target: CycleState.Creating,
        },
        [Event.INCREMENT_DURATION]: {
          actions: ['onIncrementDuration'],
        },
        [Event.DECREASE_DURATION]: {
          guard: 'canDecrementDuration',
          actions: ['onDecrementDuration'],
        },
        [Event.REQUEST_START_CHANGE]: [
          {
            guard: 'isStartDateInFuture',
            actions: ['emitStartDateInFutureValidation', 'notifyDialogValidationFailed'],
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
            actions: ['onUpdateStartDate', 'notifyDialogUpdateComplete'],
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
            actions: ['onUpdateEndDate', 'notifyDialogUpdateComplete'],
          },
        ],
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
        [Event.ON_OVERLAP_ERROR]: {
          actions: [
            {
              type: 'emitCycleOverlapValidation',
              params: ({ event }) => ({
                newStartDate: event.newStartDate,
                lastCompletedEndDate: event.lastCompletedEndDate,
              }),
            },
            'notifyDialogValidationFailed',
          ],
          target: CycleState.Idle,
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
          guard: 'canDecrementDuration',
          target: CycleState.Updating,
        },
        [Event.CONFIRM_COMPLETION]: {
          actions: ['initializePendingDates'],
          target: CycleState.ConfirmCompletion,
        },
        [Event.REQUEST_START_CHANGE]: [
          {
            guard: 'isStartDateInFuture',
            actions: ['emitStartDateInFutureValidation', 'notifyDialogValidationFailed'],
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
        [Event.ON_OVERLAP_ERROR]: {
          actions: [
            {
              type: 'emitCycleOverlapValidation',
              params: ({ event }) => ({
                newStartDate: event.newStartDate,
                lastCompletedEndDate: event.lastCompletedEndDate,
              }),
            },
            'notifyDialogValidationFailed',
          ],
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
            actions: ['emitStartDateInFutureValidation', 'notifyDialogValidationFailed'],
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
            actions: ['onEditEndDate', 'emitUpdateComplete', 'notifyDialogUpdateComplete'],
          },
        ],
        [Event.SAVE_NOTES]: CycleState.SavingNotes,
        [Event.SAVE_FEELINGS]: CycleState.SavingFeelings,
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
        [Event.ON_OVERLAP_ERROR]: {
          actions: [
            {
              type: 'emitCycleOverlapValidation',
              params: ({ event }) => ({
                newStartDate: event.newStartDate,
                lastCompletedEndDate: event.lastCompletedEndDate,
              }),
            },
            'notifyDialogValidationFailed',
          ],
          target: CycleState.ConfirmCompletion,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.ConfirmCompletion,
        },
      },
    },
    [CycleState.Completed]: {
      on: {
        [Event.CREATE]: {
          actions: ['setCurrentDatesWithFixedHour'],
          target: CycleState.Creating,
        },
      },
    },
    [CycleState.SavingNotes]: {
      invoke: [
        {
          id: 'timerActor',
          src: 'timerActor',
        },
        {
          id: 'updateNotesActor',
          src: 'updateNotesActor',
          input: ({ context, event }) => {
            assertEvent(event, Event.SAVE_NOTES);
            return {
              cycleId: context.cycleMetadata!.id,
              notes: event.notes,
            };
          },
        },
      ],
      on: {
        [Event.TICK]: {
          actions: emit({ type: Emit.TICK }),
        },
        [Event.ON_NOTES_SAVED]: {
          actions: ['setNotes', 'emitNotesSaved'],
          target: CycleState.ConfirmCompletion,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.ConfirmCompletion,
        },
      },
    },
    [CycleState.SavingFeelings]: {
      invoke: [
        {
          id: 'timerActor',
          src: 'timerActor',
        },
        {
          id: 'updateFeelingsActor',
          src: 'updateFeelingsActor',
          input: ({ context, event }) => {
            assertEvent(event, Event.SAVE_FEELINGS);
            return {
              cycleId: context.cycleMetadata!.id,
              feelings: event.feelings,
            };
          },
        },
      ],
      on: {
        [Event.TICK]: {
          actions: emit({ type: Emit.TICK }),
        },
        [Event.ON_FEELINGS_SAVED]: {
          actions: ['setFeelings', 'emitFeelingsSaved'],
          target: CycleState.ConfirmCompletion,
        },
        [Event.ON_ERROR]: {
          actions: 'emitCycleError',
          target: CycleState.ConfirmCompletion,
        },
      },
    },
  },
});
