import { assertEvent, assign, emit, setup } from 'xstate';
import type { SchedulerView } from '../domain/domain';

// ============================================================================
// ENUMS
// ============================================================================

export enum Event {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
  SUBMIT = 'SUBMIT',
  UPDATE_COMPLETE = 'UPDATE_COMPLETE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
}

export enum Emit {
  REQUEST_UPDATE = 'REQUEST_UPDATE',
  DIALOG_OPENED = 'DIALOG_OPENED',
  DIALOG_CLOSED = 'DIALOG_CLOSED',
}

export enum State {
  Closed = 'Closed',
  Open = 'Open',
  Submitting = 'Submitting',
  ValidationError = 'ValidationError',
}

// ============================================================================
// TYPES
// ============================================================================

type Context = {
  view: SchedulerView;
  initialDate: Date | null;
  pendingDate: Date | null;
  validationError: { summary: string; detail: string } | null;
};

type EventType =
  | { type: Event.OPEN; view: SchedulerView; date: Date }
  | { type: Event.CLOSE }
  | { type: Event.SUBMIT; date: Date }
  | { type: Event.UPDATE_COMPLETE }
  | { type: Event.VALIDATION_FAILED; summary: string; detail: string };

type EmitType =
  | { type: Emit.REQUEST_UPDATE; view: SchedulerView; date: Date }
  | { type: Emit.DIALOG_OPENED }
  | { type: Emit.DIALOG_CLOSED };

export type { EmitType };

// ============================================================================
// MACHINE
// ============================================================================

export const schedulerDialogMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
    input: {} as {
      view: SchedulerView;
    },
  },
  actions: {
    onSetViewAndDate: assign({
      view: ({ event }) => {
        assertEvent(event, Event.OPEN);
        return event.view;
      },
      initialDate: ({ event }) => {
        assertEvent(event, Event.OPEN);
        return event.date;
      },
    }),
    onSavePendingDate: assign({
      pendingDate: ({ event }) => {
        assertEvent(event, Event.SUBMIT);
        return event.date;
      },
    }),
    onClearPendingDate: assign({
      pendingDate: null,
    }),
    onSaveValidationError: assign({
      validationError: ({ event }) => {
        assertEvent(event, Event.VALIDATION_FAILED);
        return {
          summary: event.summary,
          detail: event.detail,
        };
      },
    }),
    onClearValidationError: assign({
      validationError: null,
    }),
    emitUpdateRequest: emit(({ context }) => ({
      type: Emit.REQUEST_UPDATE,
      view: context.view,
      date: context.pendingDate!,
    })),
    emitDialogOpened: emit({
      type: Emit.DIALOG_OPENED,
    }),
    emitDialogClosed: emit({
      type: Emit.DIALOG_CLOSED,
    }),
  },
}).createMachine({
  id: 'schedulerDialog',
  initial: State.Closed,
  context: ({ input }) => ({
    view: input.view,
    initialDate: null,
    pendingDate: null,
    validationError: null,
  }),
  states: {
    [State.Closed]: {
      entry: ['onClearPendingDate', 'onClearValidationError'],
      on: {
        [Event.OPEN]: {
          target: State.Open,
          actions: ['onSetViewAndDate', 'emitDialogOpened'],
        },
      },
    },
    [State.Open]: {
      on: {
        [Event.CLOSE]: {
          target: State.Closed,
          actions: ['emitDialogClosed'],
        },
        [Event.SUBMIT]: {
          target: State.Submitting,
          actions: ['onSavePendingDate'],
        },
      },
    },
    [State.Submitting]: {
      entry: ['emitUpdateRequest'],
      on: {
        [Event.UPDATE_COMPLETE]: {
          target: State.Closed,
          actions: ['onClearPendingDate', 'emitDialogClosed'],
        },
        [Event.VALIDATION_FAILED]: {
          target: State.ValidationError,
          actions: ['onSaveValidationError'],
        },
      },
    },
    [State.ValidationError]: {
      on: {
        [Event.CLOSE]: {
          target: State.Open,
          actions: ['onClearValidationError'],
        },
        [Event.SUBMIT]: {
          target: State.Submitting,
          actions: ['onClearValidationError', 'onSavePendingDate'],
        },
      },
    },
  },
});
