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
  date: Date | null;
};

type EventType =
  | { type: Event.OPEN; view: SchedulerView; date: Date }
  | { type: Event.CLOSE }
  | { type: Event.SUBMIT; date: Date }
  | { type: Event.UPDATE_COMPLETE }
  | { type: Event.VALIDATION_FAILED };

type EmitType = { type: Emit.REQUEST_UPDATE; view: SchedulerView; date: Date };

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
    setViewAndDate: assign({
      view: ({ event }) => {
        assertEvent(event, Event.OPEN);
        return event.view;
      },
      date: ({ event }) => {
        assertEvent(event, Event.OPEN);
        return event.date;
      },
    }),
    setDate: assign({
      date: ({ event }) => {
        assertEvent(event, Event.SUBMIT);
        return event.date;
      },
    }),
    clearDate: assign({
      date: null,
    }),
    emitUpdateRequest: emit(({ context }) => ({
      type: Emit.REQUEST_UPDATE,
      view: context.view,
      date: context.date!,
    })),
  },
}).createMachine({
  id: 'schedulerDialog',
  initial: State.Closed,
  context: ({ input }) => ({
    view: input.view,
    date: null,
  }),
  states: {
    [State.Closed]: {
      entry: 'clearDate',
      on: {
        [Event.OPEN]: {
          target: State.Open,
          actions: 'setViewAndDate',
        },
      },
    },
    [State.Open]: {
      on: {
        [Event.CLOSE]: State.Closed,
        [Event.SUBMIT]: {
          target: State.Submitting,
          actions: 'setDate',
        },
      },
    },
    [State.Submitting]: {
      entry: 'emitUpdateRequest',
      on: {
        [Event.UPDATE_COMPLETE]: {
          target: State.Closed,
          actions: 'clearDate',
        },
        [Event.VALIDATION_FAILED]: State.ValidationError,
      },
    },
    [State.ValidationError]: {
      on: {
        [Event.CLOSE]: State.Closed,
        [Event.SUBMIT]: {
          target: State.Submitting,
          actions: 'setDate',
        },
      },
    },
  },
});
