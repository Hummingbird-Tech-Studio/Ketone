import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programForgotPassword, type ForgotPasswordSuccess } from '../services/passwordRecovery.service';

export enum ForgotPasswordState {
  Idle = 'Idle',
  Submitting = 'Submitting',
}

export enum Event {
  SUBMIT = 'SUBMIT',
  ON_ERROR = 'ON_ERROR',
  ON_DONE = 'ON_DONE',
}

type EventType =
  | { type: Event.SUBMIT; email: string }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_DONE; result: ForgotPasswordSuccess };

export enum Emit {
  FORGOT_PASSWORD_SUCCESS = 'FORGOT_PASSWORD_SUCCESS',
  FORGOT_PASSWORD_ERROR = 'FORGOT_PASSWORD_ERROR',
}

export type EmitType =
  | { type: Emit.FORGOT_PASSWORD_SUCCESS; result: ForgotPasswordSuccess }
  | { type: Emit.FORGOT_PASSWORD_ERROR; error: string };

type Context = Record<string, never>;

const forgotPasswordLogic = fromCallback<EventObject, { email: string }>(({ sendBack, input }) =>
  runWithUi(
    programForgotPassword(input.email),
    (result) => {
      sendBack({ type: Event.ON_DONE, result });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_ERROR, error: errorMessage });
    },
  )
);

export const forgotPasswordMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitForgotPasswordSuccess: emit(({ event }) => {
      assertEvent(event, Event.ON_DONE);

      return {
        type: Emit.FORGOT_PASSWORD_SUCCESS,
        result: event.result,
      } as const;
    }),
    emitForgotPasswordError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.FORGOT_PASSWORD_ERROR,
        error: event.error,
      } as const;
    }),
  },
  actors: {
    forgotPasswordActor: forgotPasswordLogic,
  },
}).createMachine({
  id: 'forgotPassword',
  context: {},
  initial: ForgotPasswordState.Idle,
  states: {
    [ForgotPasswordState.Idle]: {
      on: {
        [Event.SUBMIT]: ForgotPasswordState.Submitting,
      },
    },
    [ForgotPasswordState.Submitting]: {
      invoke: {
        id: 'forgotPasswordActor',
        src: 'forgotPasswordActor',
        input: ({ event }) => {
          assertEvent(event, Event.SUBMIT);
          return { email: event.email };
        },
      },
      on: {
        [Event.ON_DONE]: {
          actions: 'emitForgotPasswordSuccess',
          target: ForgotPasswordState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: 'emitForgotPasswordError',
          target: ForgotPasswordState.Idle,
        },
      },
    },
  },
});
