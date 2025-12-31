import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programSignIn, type SignInSuccess } from '../services/signIn.service';

export enum SignInState {
  Idle = 'Idle',
  Submitting = 'Submitting',
}

export enum Event {
  SUBMIT = 'SUBMIT',
  ON_ERROR = 'ON_ERROR',
  ON_DONE = 'ON_DONE',
}

type EventType =
  | { type: Event.SUBMIT; values: { email: string; password: string } }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_DONE; result: SignInSuccess };

export enum Emit {
  SIGN_IN_SUCCESS = 'SIGN_IN_SUCCESS',
  SIGN_IN_ERROR = 'SIGN_IN_ERROR',
}

export type EmitType =
  | { type: Emit.SIGN_IN_SUCCESS; result: SignInSuccess }
  | { type: Emit.SIGN_IN_ERROR; error: string };

type Context = Record<string, never>;

const signInLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) =>
  runWithUi(
    programSignIn(input.email, input.password),
    (result) => {
      sendBack({ type: Event.ON_DONE, result });
    },
    (error) => {
      sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

export const signInMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitSignInSuccess: emit(({ event }) => {
      assertEvent(event, Event.ON_DONE);

      return {
        type: Emit.SIGN_IN_SUCCESS,
        result: event.result,
      } as const;
    }),
    emitSignInError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.SIGN_IN_ERROR,
        error: event.error,
      } as const;
    }),
  },
  actors: {
    signInActor: signInLogic,
  },
}).createMachine({
  id: 'signIn',
  context: {},
  initial: SignInState.Idle,
  states: {
    [SignInState.Idle]: {
      on: {
        [Event.SUBMIT]: SignInState.Submitting,
      },
    },
    [SignInState.Submitting]: {
      invoke: {
        id: 'signInActor',
        src: 'signInActor',
        input: ({ event }) => {
          assertEvent(event, Event.SUBMIT);
          return event.values;
        },
      },
      on: {
        [Event.ON_DONE]: {
          actions: 'emitSignInSuccess',
          target: SignInState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: 'emitSignInError',
          target: SignInState.Idle,
        },
      },
    },
  },
});
