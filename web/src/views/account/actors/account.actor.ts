import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, createActor, emit, fromCallback, setup, type EventObject } from 'xstate';
import { updateEmailProgram, type UpdateEmailSuccess } from '../services/account.service';

export enum AccountState {
  Idle = 'Idle',
  Updating = 'Updating',
}

export enum Event {
  UPDATE_EMAIL = 'UPDATE_EMAIL',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_UPDATE_ERROR = 'ON_UPDATE_ERROR',
}

type EventType =
  | { type: Event.UPDATE_EMAIL; email: string; password: string }
  | { type: Event.ON_UPDATE_SUCCESS; result: UpdateEmailSuccess }
  | { type: Event.ON_UPDATE_ERROR; error: string };

export enum Emit {
  EMAIL_UPDATED = 'EMAIL_UPDATED',
  EMAIL_UPDATE_ERROR = 'EMAIL_UPDATE_ERROR',
}

export type EmitType =
  | { type: Emit.EMAIL_UPDATED; result: UpdateEmailSuccess }
  | { type: Emit.EMAIL_UPDATE_ERROR; error: string };

const updateEmailLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) => {
  runWithUi(
    updateEmailProgram(input.email, input.password),
    (result) => {
      sendBack({ type: Event.ON_UPDATE_SUCCESS, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_UPDATE_ERROR, error: errorMessage });
    },
  );
});

export const accountMachine = setup({
  types: {
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitEmailUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return {
        type: Emit.EMAIL_UPDATED,
        result: event.result,
      };
    }),
    emitEmailUpdateError: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_ERROR);
      return {
        type: Emit.EMAIL_UPDATE_ERROR,
        error: event.error,
      };
    }),
  },
  actors: {
    updateEmailActor: updateEmailLogic,
  },
}).createMachine({
  id: 'account',
  initial: AccountState.Idle,
  states: {
    [AccountState.Idle]: {
      on: {
        [Event.UPDATE_EMAIL]: AccountState.Updating,
      },
    },
    [AccountState.Updating]: {
      invoke: {
        id: 'updateEmailActor',
        src: 'updateEmailActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_EMAIL);
          return { email: event.email, password: event.password };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['emitEmailUpdated'],
          target: AccountState.Idle,
        },
        [Event.ON_UPDATE_ERROR]: {
          actions: ['emitEmailUpdateError'],
          target: AccountState.Idle,
        },
      },
    },
  },
});

// Create a singleton actor instance
export const accountActor = createActor(accountMachine);
