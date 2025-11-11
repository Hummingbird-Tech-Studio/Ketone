import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programSignUp, type SignUpSuccess } from '../services/signUp.service';

export enum SignUpState {
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
  | { type: Event.ON_DONE; result: SignUpSuccess };

export enum Emit {
  SIGN_UP_SUCCESS = 'SIGN_UP_SUCCESS',
  SIGN_UP_ERROR = 'SIGN_UP_ERROR',
}

export type EmitType =
  | { type: Emit.SIGN_UP_SUCCESS; result: SignUpSuccess }
  | { type: Emit.SIGN_UP_ERROR; error: string };

type Context = Record<string, never>;

const signUpLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) => {
  runWithUi(
    programSignUp(input.email, input.password),
    (result) => {
      sendBack({ type: Event.ON_DONE, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  );
});

export const signUpMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitSignUpSuccess: emit(({ event }) => {
      assertEvent(event, Event.ON_DONE);

      return {
        type: Emit.SIGN_UP_SUCCESS,
        result: event.result,
      } as const;
    }),
    emitSignUpError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.SIGN_UP_ERROR,
        error: event.error,
      } as const;
    }),
  },
  actors: {
    signUpActor: signUpLogic,
  },
}).createMachine({
  id: 'signUp',
  context: {},
  initial: SignUpState.Idle,
  states: {
    [SignUpState.Idle]: {
      on: {
        [Event.SUBMIT]: SignUpState.Submitting,
      },
    },
    [SignUpState.Submitting]: {
      invoke: {
        id: 'signUpActor',
        src: 'signUpActor',
        input: ({ event }) => {
          assertEvent(event, Event.SUBMIT);
          return event.values;
        },
      },
      on: {
        [Event.ON_DONE]: {
          actions: 'emitSignUpSuccess',
          target: SignUpState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: 'emitSignUpError',
          target: SignUpState.Idle,
        },
      },
    },
  },
});
