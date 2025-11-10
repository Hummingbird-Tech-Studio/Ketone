import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programSignUp, type SignUpSuccess } from '../services/signUp.service';

export enum SignUpState {
  Idle = 'Idle',
  Submitting = 'Submitting',
  Success = 'Success',
}

export enum Event {
  SUBMIT = 'SUBMIT',
  RESET_CONTEXT = 'RESET_CONTEXT',
  SUCCESS = 'SUCCESS',
  ON_ERROR = 'ON_ERROR',
  ON_DONE = 'ON_DONE',
}

type EventType =
  | { type: Event.SUBMIT; values: { email: string; password: string } }
  | { type: Event.RESET_CONTEXT }
  | { type: Event.SUCCESS }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_DONE; result: SignUpSuccess };

export enum Emit {
  SIGN_UP_SUCCESS = 'SIGN_UP_SUCCESS',
  REDIRECT = 'REDIRECT',
}

type EmitType = { type: Emit.SIGN_UP_SUCCESS; result: SignUpSuccess } | { type: Emit.REDIRECT };

type Context = {
  serviceError: string | null;
};

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
    onDoneSubmitting: emit(({ event }) => {
      assertEvent(event, Event.ON_DONE);

      return {
        type: Emit.SIGN_UP_SUCCESS,
        result: event.result,
      };
    }),
    updateServiceError: assign({
      serviceError: ({ event }) => {
        assertEvent(event, Event.ON_ERROR);

        return event.error;
      },
    }),
    resetContext: assign({
      serviceError: null,
    }),
  },
  actors: {
    signUpActor: signUpLogic,
  },
}).createMachine({
  id: 'signUp',
  context: {
    serviceError: null,
  },
  initial: SignUpState.Idle,
  states: {
    [SignUpState.Idle]: {
      on: {
        [Event.SUBMIT]: SignUpState.Submitting,
      },
    },
    [SignUpState.Submitting]: {
      entry: ['resetContext'],
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
          actions: ['onDoneSubmitting', emit({ type: Emit.REDIRECT })],
          target: SignUpState.Success,
        },
        [Event.ON_ERROR]: {
          actions: 'updateServiceError',
          target: SignUpState.Idle,
        },
      },
    },
    [SignUpState.Success]: {
      entry: ['resetContext'],
      always: SignUpState.Idle,
    },
  },
  on: {
    [Event.RESET_CONTEXT]: {
      actions: ['resetContext'],
      target: '.Idle',
    },
  },
});