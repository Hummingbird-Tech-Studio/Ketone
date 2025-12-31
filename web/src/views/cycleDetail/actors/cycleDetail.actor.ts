import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { formatFullDateTime } from '@/utils/formatting';
import type { AdjacentCycle } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programDeleteCycle,
  programGetCycle,
  programUpdateCompletedCycle,
  programUpdateCycle,
  programUpdateCycleFeelings,
  programUpdateCycleNotes,
  type DeleteCycleError,
  type GetCycleSuccess,
  type UpdateCycleError,
} from '../../cycle/services/cycle.service';

const VALIDATION_INFO = {
  START_DATE_AFTER_END: {
    summary: 'Start date after end date',
  },
  END_DATE_BEFORE_START: {
    summary: 'End date before start date',
  },
  OVERLAP_WITH_PREVIOUS: {
    summary: 'Cycle overlaps with previous cycle',
  },
  OVERLAP_WITH_NEXT: {
    summary: 'Cycle overlaps with next cycle',
  },
};

export enum CycleDetailState {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Updating = 'Updating',
  Deleting = 'Deleting',
  SavingNotes = 'SavingNotes',
  SavingFeelings = 'SavingFeelings',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  REQUEST_START_CHANGE = 'REQUEST_START_CHANGE',
  REQUEST_END_CHANGE = 'REQUEST_END_CHANGE',
  REQUEST_DELETE = 'REQUEST_DELETE',
  SAVE_NOTES = 'SAVE_NOTES',
  SAVE_FEELINGS = 'SAVE_FEELINGS',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_DELETE_SUCCESS = 'ON_DELETE_SUCCESS',
  ON_NOTES_SAVED = 'ON_NOTES_SAVED',
  ON_FEELINGS_SAVED = 'ON_FEELINGS_SAVED',
  ON_ERROR = 'ON_ERROR',
  ON_DELETE_ERROR = 'ON_DELETE_ERROR',
}

export enum Emit {
  CYCLE_ERROR = 'CYCLE_ERROR',
  VALIDATION_INFO = 'VALIDATION_INFO',
  UPDATE_COMPLETE = 'UPDATE_COMPLETE',
  DELETE_COMPLETE = 'DELETE_COMPLETE',
  DELETE_ERROR = 'DELETE_ERROR',
  NOTES_SAVED = 'NOTES_SAVED',
  FEELINGS_SAVED = 'FEELINGS_SAVED',
}

type EventType =
  | { type: Event.LOAD }
  | { type: Event.REQUEST_START_CHANGE; date: Date }
  | { type: Event.REQUEST_END_CHANGE; date: Date }
  | { type: Event.REQUEST_DELETE }
  | { type: Event.SAVE_NOTES; notes: string }
  | { type: Event.SAVE_FEELINGS; feelings: string[] }
  | { type: Event.ON_SUCCESS; result: GetCycleSuccess }
  | { type: Event.ON_UPDATE_SUCCESS; result: GetCycleSuccess }
  | { type: Event.ON_DELETE_SUCCESS }
  | { type: Event.ON_NOTES_SAVED; result: GetCycleSuccess }
  | { type: Event.ON_FEELINGS_SAVED; result: GetCycleSuccess }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_DELETE_ERROR; error: string };

export type EmitType =
  | { type: Emit.CYCLE_ERROR; error: string }
  | { type: Emit.VALIDATION_INFO; summary: string; detail: string }
  | { type: Emit.UPDATE_COMPLETE }
  | { type: Emit.DELETE_COMPLETE }
  | { type: Emit.DELETE_ERROR; error: string }
  | { type: Emit.NOTES_SAVED }
  | { type: Emit.FEELINGS_SAVED };

type Context = {
  cycleId: string;
  cycle: GetCycleSuccess | null;
  pendingStartDate: Date | null;
  pendingEndDate: Date | null;
  error: string | null;
};

type Input = {
  cycleId: string;
};

function handleUpdateError(error: UpdateCycleError): { type: Event.ON_ERROR; error: string } {
  return Match.value(error).pipe(
    Match.orElse((err) => ({ type: Event.ON_ERROR as const, error: extractErrorMessage(err) })),
  );
}

function handleDeleteError(error: DeleteCycleError): { type: Event.ON_DELETE_ERROR; error: string } {
  return Match.value(error).pipe(
    Match.orElse((err) => ({ type: Event.ON_DELETE_ERROR as const, error: extractErrorMessage(err) })),
  );
}

// Validation check functions
function checkIsStartDateAfterEnd(newStartDate: Date, endDate: Date): boolean {
  return newStartDate >= endDate;
}

function checkIsEndDateBeforeStart(newEndDate: Date, startDate: Date): boolean {
  return newEndDate <= startDate;
}

function checkOverlapWithPrevious(newStartDate: Date, previousCycle: AdjacentCycle | undefined): boolean {
  if (!previousCycle) return false;
  return newStartDate < previousCycle.endDate;
}

function checkOverlapWithNext(newEndDate: Date, nextCycle: AdjacentCycle | undefined): boolean {
  if (!nextCycle) return false;
  return newEndDate > nextCycle.startDate;
}

// Validation message functions
function getStartDateAfterEndMessage(newStartDate: Date, endDate: Date): { summary: string; detail: string } {
  return {
    summary: VALIDATION_INFO.START_DATE_AFTER_END.summary,
    detail: `The start date (${formatFullDateTime(newStartDate)}) cannot be after the end date (${formatFullDateTime(endDate)}).`,
  };
}

function getEndDateBeforeStartMessage(newEndDate: Date, startDate: Date): { summary: string; detail: string } {
  return {
    summary: VALIDATION_INFO.END_DATE_BEFORE_START.summary,
    detail: `The end date (${formatFullDateTime(newEndDate)}) cannot be before the start date (${formatFullDateTime(startDate)}).`,
  };
}

function getOverlapWithPreviousMessage(newStartDate: Date, previousEndDate: Date): { summary: string; detail: string } {
  return {
    summary: VALIDATION_INFO.OVERLAP_WITH_PREVIOUS.summary,
    detail: `The start date (${formatFullDateTime(newStartDate)}) overlaps with the previous cycle which ended at ${formatFullDateTime(previousEndDate)}. Please select a date after ${formatFullDateTime(previousEndDate)}.`,
  };
}

function getOverlapWithNextMessage(newEndDate: Date, nextStartDate: Date): { summary: string; detail: string } {
  return {
    summary: VALIDATION_INFO.OVERLAP_WITH_NEXT.summary,
    detail: `The end date (${formatFullDateTime(newEndDate)}) overlaps with the next cycle which starts at ${formatFullDateTime(nextStartDate)}. Please select a date before ${formatFullDateTime(nextStartDate)}.`,
  };
}

const loadCycleLogic = fromCallback<EventObject, { cycleId: string }>(({ sendBack, input }) =>
  runWithUi(
    programGetCycle(input.cycleId),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

const updateCycleLogic = fromCallback<EventObject, { cycleId: string; startDate: Date; endDate: Date; status: string }>(
  ({ sendBack, input }) => {
    const program =
      input.status === 'Completed'
        ? programUpdateCompletedCycle(input.cycleId, input.startDate, input.endDate)
        : programUpdateCycle(input.cycleId, input.startDate, input.endDate);

    return runWithUi(
      program,
      (result) => {
        sendBack({ type: Event.ON_UPDATE_SUCCESS, result });
      },
      (error) => {
        sendBack(handleUpdateError(error));
      },
    );
  },
);

const deleteCycleLogic = fromCallback<EventObject, { cycleId: string }>(({ sendBack, input }) =>
  runWithUi(
    programDeleteCycle(input.cycleId),
    () => {
      sendBack({ type: Event.ON_DELETE_SUCCESS });
    },
    (error) => {
      sendBack(handleDeleteError(error));
    },
  ),
);

const updateNotesLogic = fromCallback<EventObject, { cycleId: string; notes: string }>(({ sendBack, input }) =>
  runWithUi(
    programUpdateCycleNotes(input.cycleId, input.notes),
    (result) => {
      sendBack({ type: Event.ON_NOTES_SAVED, result });
    },
    (error) => {
      sendBack(handleUpdateError(error));
    },
  ),
);

const updateFeelingsLogic = fromCallback<EventObject, { cycleId: string; feelings: string[] }>(({ sendBack, input }) =>
  runWithUi(
    programUpdateCycleFeelings(input.cycleId, input.feelings),
    (result) => {
      sendBack({ type: Event.ON_FEELINGS_SAVED, result });
    },
    (error) => {
      sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

export const cycleDetailMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
    input: {} as Input,
  },
  actions: {
    setCycleData: assign(({ context, event }) => {
      if (event.type === Event.ON_SUCCESS) {
        // Initial load - use full result including adjacent cycles
        return {
          cycle: event.result,
          error: null,
        };
      }

      if (
        event.type === Event.ON_UPDATE_SUCCESS ||
        event.type === Event.ON_NOTES_SAVED ||
        event.type === Event.ON_FEELINGS_SAVED
      ) {
        // Update - preserve adjacent cycles from context since update response doesn't include them
        return {
          cycle: {
            ...event.result,
            previousCycle: context.cycle?.previousCycle,
            nextCycle: context.cycle?.nextCycle,
          },
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
    setPendingDates: assign(({ context, event }) => {
      if (event.type === Event.REQUEST_START_CHANGE) {
        return {
          pendingStartDate: event.date,
          pendingEndDate: context.cycle!.endDate,
        };
      }
      if (event.type === Event.REQUEST_END_CHANGE) {
        return {
          pendingStartDate: context.cycle!.startDate,
          pendingEndDate: event.date,
        };
      }
      return {};
    }),
    clearPendingDates: assign(() => ({
      pendingStartDate: null,
      pendingEndDate: null,
    })),
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
    emitStartDateAfterEndValidation: emit(({ context, event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      const { summary, detail } = getStartDateAfterEndMessage(event.date, context.cycle!.endDate);
      return { type: Emit.VALIDATION_INFO, summary, detail };
    }),
    emitEndDateBeforeStartValidation: emit(({ context, event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      const { summary, detail } = getEndDateBeforeStartMessage(event.date, context.cycle!.startDate);
      return { type: Emit.VALIDATION_INFO, summary, detail };
    }),
    emitOverlapWithPreviousValidation: emit(({ context, event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      const { summary, detail } = getOverlapWithPreviousMessage(event.date, context.cycle!.previousCycle!.endDate);
      return { type: Emit.VALIDATION_INFO, summary, detail };
    }),
    emitOverlapWithNextValidation: emit(({ context, event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      const { summary, detail } = getOverlapWithNextMessage(event.date, context.cycle!.nextCycle!.startDate);
      return { type: Emit.VALIDATION_INFO, summary, detail };
    }),
    emitDeleteComplete: emit(() => ({
      type: Emit.DELETE_COMPLETE,
    })),
    emitDeleteError: emit(({ event }) => {
      assertEvent(event, Event.ON_DELETE_ERROR);
      return { type: Emit.DELETE_ERROR, error: event.error };
    }),
    emitNotesSaved: emit(() => ({
      type: Emit.NOTES_SAVED,
    })),
    emitFeelingsSaved: emit(() => ({
      type: Emit.FEELINGS_SAVED,
    })),
  },
  guards: {
    isStartDateAfterEnd: ({ context, event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkIsStartDateAfterEnd(event.date, context.cycle!.endDate);
    },
    isEndDateBeforeStart: ({ context, event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      return checkIsEndDateBeforeStart(event.date, context.cycle!.startDate);
    },
    hasOverlapWithPrevious: ({ context, event }) => {
      assertEvent(event, Event.REQUEST_START_CHANGE);
      return checkOverlapWithPrevious(event.date, context.cycle!.previousCycle);
    },
    hasOverlapWithNext: ({ context, event }) => {
      assertEvent(event, Event.REQUEST_END_CHANGE);
      return checkOverlapWithNext(event.date, context.cycle!.nextCycle);
    },
  },
  actors: {
    loadCycleActor: loadCycleLogic,
    updateCycleActor: updateCycleLogic,
    deleteCycleActor: deleteCycleLogic,
    updateNotesActor: updateNotesLogic,
    updateFeelingsActor: updateFeelingsLogic,
  },
}).createMachine({
  id: 'cycleDetail',
  context: ({ input }) => ({
    cycleId: input.cycleId,
    cycle: null,
    pendingStartDate: null,
    pendingEndDate: null,
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
        // Validate start date change with guards
        [Event.REQUEST_START_CHANGE]: [
          {
            guard: 'isStartDateAfterEnd',
            actions: ['emitStartDateAfterEndValidation'],
          },
          {
            guard: 'hasOverlapWithPrevious',
            actions: ['emitOverlapWithPreviousValidation'],
          },
          {
            actions: ['setPendingDates'],
            target: CycleDetailState.Updating,
          },
        ],
        // Validate end date change with guards
        [Event.REQUEST_END_CHANGE]: [
          {
            guard: 'isEndDateBeforeStart',
            actions: ['emitEndDateBeforeStartValidation'],
          },
          {
            guard: 'hasOverlapWithNext',
            actions: ['emitOverlapWithNextValidation'],
          },
          {
            actions: ['setPendingDates'],
            target: CycleDetailState.Updating,
          },
        ],
        [Event.REQUEST_DELETE]: CycleDetailState.Deleting,
        [Event.SAVE_NOTES]: CycleDetailState.SavingNotes,
        [Event.SAVE_FEELINGS]: CycleDetailState.SavingFeelings,
      },
    },
    [CycleDetailState.Updating]: {
      invoke: {
        id: 'updateCycleActor',
        src: 'updateCycleActor',
        input: ({ context }) => ({
          cycleId: context.cycleId,
          startDate: context.pendingStartDate ?? context.cycle!.startDate,
          endDate: context.pendingEndDate ?? context.cycle!.endDate,
          status: context.cycle!.status,
        }),
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['setCycleData', 'emitUpdateComplete', 'clearPendingDates'],
          target: CycleDetailState.Loaded,
        },
        [Event.ON_ERROR]: {
          actions: ['emitCycleError', 'clearPendingDates'],
          target: CycleDetailState.Loaded,
        },
      },
    },
    [CycleDetailState.Deleting]: {
      invoke: {
        id: 'deleteCycleActor',
        src: 'deleteCycleActor',
        input: ({ context }) => ({ cycleId: context.cycleId }),
      },
      on: {
        [Event.ON_DELETE_SUCCESS]: {
          actions: ['emitDeleteComplete'],
        },
        [Event.ON_DELETE_ERROR]: {
          actions: ['emitDeleteError'],
          target: CycleDetailState.Loaded,
        },
      },
    },
    [CycleDetailState.SavingNotes]: {
      invoke: {
        id: 'updateNotesActor',
        src: 'updateNotesActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.SAVE_NOTES);
          return {
            cycleId: context.cycleId,
            notes: event.notes,
          };
        },
      },
      on: {
        [Event.ON_NOTES_SAVED]: {
          actions: ['setCycleData', 'emitNotesSaved'],
          target: CycleDetailState.Loaded,
        },
        [Event.ON_ERROR]: {
          actions: ['emitCycleError'],
          target: CycleDetailState.Loaded,
        },
      },
    },
    [CycleDetailState.SavingFeelings]: {
      invoke: {
        id: 'updateFeelingsActor',
        src: 'updateFeelingsActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.SAVE_FEELINGS);
          return {
            cycleId: context.cycleId,
            feelings: event.feelings,
          };
        },
      },
      on: {
        [Event.ON_FEELINGS_SAVED]: {
          actions: ['setCycleData', 'emitFeelingsSaved'],
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
