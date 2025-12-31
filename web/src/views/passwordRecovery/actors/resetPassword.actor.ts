import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { Match } from 'effect';
import { assertEvent, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programResetPassword,
  type ResetPasswordError,
  type ResetPasswordSuccess,
} from '../services/passwordRecovery.service';

export enum ResetPasswordState {
  Idle = 'Idle',
  Submitting = 'Submitting',
}

export enum Event {
  SUBMIT = 'SUBMIT',
  ON_ERROR = 'ON_ERROR',
  ON_DONE = 'ON_DONE',
  ON_TOKEN_INVALID = 'ON_TOKEN_INVALID',
}

type EventType =
  | { type: Event.SUBMIT; token: string; password: string }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_DONE; result: ResetPasswordSuccess }
  | { type: Event.ON_TOKEN_INVALID; error: string };

export enum Emit {
  RESET_PASSWORD_SUCCESS = 'RESET_PASSWORD_SUCCESS',
  RESET_PASSWORD_ERROR = 'RESET_PASSWORD_ERROR',
  RESET_PASSWORD_TOKEN_INVALID = 'RESET_PASSWORD_TOKEN_INVALID',
}

export type EmitType =
  | { type: Emit.RESET_PASSWORD_SUCCESS; result: ResetPasswordSuccess }
  | { type: Emit.RESET_PASSWORD_ERROR; error: string }
  | { type: Emit.RESET_PASSWORD_TOKEN_INVALID; error: string };

type Context = Record<string, never>;

function handleResetPasswordError(error: ResetPasswordError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'PasswordResetTokenInvalidError' }, (err) => ({
      type: Event.ON_TOKEN_INVALID,
      error: err.message,
    })),
    Match.orElse((err) => ({ type: Event.ON_ERROR, error: extractErrorMessage(err) })),
  );
}

const resetPasswordLogic = fromCallback<EventObject, { token: string; password: string }>(({ sendBack, input }) =>
  runWithUi(
    programResetPassword(input.token, input.password),
    (result) => {
      sendBack({ type: Event.ON_DONE, result });
    },
    (error) => {
      sendBack(handleResetPasswordError(error));
    },
  ),
);

export const resetPasswordMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitResetPasswordSuccess: emit(({ event }) => {
      assertEvent(event, Event.ON_DONE);

      return {
        type: Emit.RESET_PASSWORD_SUCCESS,
        result: event.result,
      } as const;
    }),
    emitResetPasswordError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);

      return {
        type: Emit.RESET_PASSWORD_ERROR,
        error: event.error,
      } as const;
    }),
    emitResetPasswordTokenInvalid: emit(({ event }) => {
      assertEvent(event, Event.ON_TOKEN_INVALID);

      return {
        type: Emit.RESET_PASSWORD_TOKEN_INVALID,
        error: event.error,
      } as const;
    }),
  },
  actors: {
    resetPasswordActor: resetPasswordLogic,
  },
}).createMachine({
  id: 'resetPassword',
  context: {},
  initial: ResetPasswordState.Idle,
  states: {
    [ResetPasswordState.Idle]: {
      on: {
        [Event.SUBMIT]: ResetPasswordState.Submitting,
      },
    },
    [ResetPasswordState.Submitting]: {
      invoke: {
        id: 'resetPasswordActor',
        src: 'resetPasswordActor',
        input: ({ event }) => {
          assertEvent(event, Event.SUBMIT);
          return { token: event.token, password: event.password };
        },
      },
      on: {
        [Event.ON_DONE]: {
          actions: 'emitResetPasswordSuccess',
          target: ResetPasswordState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: 'emitResetPasswordError',
          target: ResetPasswordState.Idle,
        },
        [Event.ON_TOKEN_INVALID]: {
          actions: 'emitResetPasswordTokenInvalid',
          target: ResetPasswordState.Idle,
        },
      },
    },
  },
});
