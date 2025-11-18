import { assertEvent, assign, emit, setup } from 'xstate';
import type { SchedulerView } from '../domain/domain';

// ============================================================================
// ENUMS
// ============================================================================

export const Event = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
  SUBMIT: 'SUBMIT',
  NOW: 'NOW',
  UPDATE_COMPLETE: 'UPDATE_COMPLETE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export const Emit = {
  REQUEST_UPDATE: 'REQUEST_UPDATE',
  DIALOG_OPENED: 'DIALOG_OPENED',
  DIALOG_CLOSED: 'DIALOG_CLOSED',
} as const;

export const SchedulerDialogState = {
  Closed: 'Closed',
  Open: 'Open',
  Submitting: 'Submitting',
  ValidationError: 'ValidationError',
} as const;

// ============================================================================
// TYPES
// ============================================================================

type Context = {
  view: SchedulerView;
  pendingDate: Date | null;
  validationError: { summary: string; detail: string } | null;
};

type EventType =
  | { type: typeof Event.OPEN }
  | { type: typeof Event.CLOSE }
  | { type: typeof Event.SUBMIT; date: Date }
  | { type: typeof Event.NOW }
  | { type: typeof Event.UPDATE_COMPLETE }
  | { type: typeof Event.VALIDATION_FAILED; summary: string; detail: string };

type EmitType =
  | { type: typeof Emit.REQUEST_UPDATE; view: SchedulerView; date: Date }
  | { type: typeof Emit.DIALOG_OPENED }
  | { type: typeof Emit.DIALOG_CLOSED };

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
    onSavePendingDate: assign({
      pendingDate: ({ event }) => {
        assertEvent(event, Event.SUBMIT);
        return event.date;
      },
    }),
    onSavePendingDateNow: assign({
      pendingDate: () => new Date(),
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
  initial: SchedulerDialogState.Closed,
  context: ({ input }) => ({
    view: input.view,
    pendingDate: null,
    validationError: null,
  }),
  states: {
    [SchedulerDialogState.Closed]: {
      entry: ['onClearPendingDate', 'onClearValidationError'],
      on: {
        [Event.OPEN]: {
          target: SchedulerDialogState.Open,
          actions: ['emitDialogOpened'],
        },
      },
    },
    [SchedulerDialogState.Open]: {
      on: {
        [Event.CLOSE]: {
          target: SchedulerDialogState.Closed,
          actions: ['emitDialogClosed'],
        },
        [Event.SUBMIT]: {
          target: SchedulerDialogState.Submitting,
          actions: ['onSavePendingDate'],
        },
        [Event.NOW]: {
          target: SchedulerDialogState.Submitting,
          actions: ['onSavePendingDateNow'],
        },
      },
    },
    [SchedulerDialogState.Submitting]: {
      entry: ['emitUpdateRequest'],
      on: {
        [Event.UPDATE_COMPLETE]: {
          target: SchedulerDialogState.Closed,
          actions: ['onClearPendingDate', 'emitDialogClosed'],
        },
        [Event.VALIDATION_FAILED]: {
          target: SchedulerDialogState.ValidationError,
          actions: ['onSaveValidationError'],
        },
      },
    },
    [SchedulerDialogState.ValidationError]: {
      on: {
        [Event.CLOSE]: {
          target: SchedulerDialogState.Open,
          actions: ['onClearValidationError'],
        },
        [Event.SUBMIT]: {
          target: SchedulerDialogState.Submitting,
          actions: ['onClearValidationError', 'onSavePendingDate'],
        },
      },
    },
  },
});
