import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { LOCKOUT_DURATION_SECONDS, MAX_PASSWORD_ATTEMPTS } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, createActor, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programDeleteAccount,
  programUpdateEmail,
  programUpdatePassword,
  type DeleteAccountError,
  type UpdateEmailError,
  type UpdateEmailSuccess,
  type UpdatePasswordError,
  type UpdatePasswordSuccess,
} from '../services/account.service';

export enum AccountState {
  Idle = 'Idle',
  UpdatingEmail = 'UpdatingEmail',
  UpdatingPassword = 'UpdatingPassword',
  DeletingAccount = 'DeletingAccount',
}

export enum Event {
  UPDATE_EMAIL = 'UPDATE_EMAIL',
  ON_EMAIL_UPDATE_SUCCESS = 'ON_EMAIL_UPDATE_SUCCESS',
  ON_EMAIL_UPDATE_ERROR = 'ON_EMAIL_UPDATE_ERROR',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  ON_PASSWORD_UPDATE_SUCCESS = 'ON_PASSWORD_UPDATE_SUCCESS',
  ON_PASSWORD_UPDATE_ERROR = 'ON_PASSWORD_UPDATE_ERROR',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  ON_DELETE_ACCOUNT_SUCCESS = 'ON_DELETE_ACCOUNT_SUCCESS',
  ON_DELETE_ACCOUNT_ERROR = 'ON_DELETE_ACCOUNT_ERROR',
  ON_RATE_LIMITED = 'ON_RATE_LIMITED',
  ON_INVALID_PASSWORD = 'ON_INVALID_PASSWORD',
  RESET_RATE_LIMIT = 'RESET_RATE_LIMIT',
}

interface AccountContext {
  remainingAttempts: number;
  blockedUntil: number | null;
}

type EventType =
  | { type: Event.UPDATE_EMAIL; email: string; password: string }
  | { type: Event.ON_EMAIL_UPDATE_SUCCESS; result: UpdateEmailSuccess }
  | { type: Event.ON_EMAIL_UPDATE_ERROR; error: string }
  | { type: Event.UPDATE_PASSWORD; currentPassword: string; newPassword: string }
  | { type: Event.ON_PASSWORD_UPDATE_SUCCESS; result: UpdatePasswordSuccess }
  | { type: Event.ON_PASSWORD_UPDATE_ERROR; error: string }
  | { type: Event.DELETE_ACCOUNT; password: string }
  | { type: Event.ON_DELETE_ACCOUNT_SUCCESS }
  | { type: Event.ON_DELETE_ACCOUNT_ERROR; error: string }
  | { type: Event.ON_RATE_LIMITED; retryAfter: number }
  | { type: Event.ON_INVALID_PASSWORD; remainingAttempts: number; error: string }
  | { type: Event.RESET_RATE_LIMIT };

export enum Emit {
  EMAIL_UPDATED = 'EMAIL_UPDATED',
  EMAIL_UPDATE_ERROR = 'EMAIL_UPDATE_ERROR',
  PASSWORD_UPDATED = 'PASSWORD_UPDATED',
  PASSWORD_UPDATE_ERROR = 'PASSWORD_UPDATE_ERROR',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ACCOUNT_DELETE_ERROR = 'ACCOUNT_DELETE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_PASSWORD = 'INVALID_PASSWORD',
}

export type EmitType =
  | { type: Emit.EMAIL_UPDATED; result: UpdateEmailSuccess }
  | { type: Emit.EMAIL_UPDATE_ERROR; error: string }
  | { type: Emit.PASSWORD_UPDATED; result: UpdatePasswordSuccess }
  | { type: Emit.PASSWORD_UPDATE_ERROR; error: string }
  | { type: Emit.ACCOUNT_DELETED }
  | { type: Emit.ACCOUNT_DELETE_ERROR; error: string }
  | { type: Emit.RATE_LIMITED; retryAfter: number }
  | { type: Emit.INVALID_PASSWORD; remainingAttempts: number; error: string };

/**
 * Handles errors from email update operations using pattern matching.
 */
function handleUpdateEmailError(error: UpdateEmailError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'TooManyRequestsError' }, (err) => ({
      type: Event.ON_RATE_LIMITED,
      retryAfter: err.retryAfter,
    })),
    Match.when({ _tag: 'InvalidPasswordError' }, (err) => ({
      type: Event.ON_INVALID_PASSWORD,
      remainingAttempts: err.remainingAttempts,
      error: err.message,
    })),
    Match.when({ _tag: 'SameEmailError' }, (err) => ({
      type: Event.ON_EMAIL_UPDATE_ERROR,
      error: err.message,
    })),
    Match.when({ _tag: 'EmailAlreadyInUseError' }, (err) => ({
      type: Event.ON_EMAIL_UPDATE_ERROR,
      error: err.message,
    })),
    Match.orElse((err) => ({ type: Event.ON_EMAIL_UPDATE_ERROR, error: extractErrorMessage(err) })),
  );
}

/**
 * Handles errors from password update operations using pattern matching.
 */
function handleUpdatePasswordError(error: UpdatePasswordError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'TooManyRequestsError' }, (err) => ({
      type: Event.ON_RATE_LIMITED,
      retryAfter: err.retryAfter,
    })),
    Match.when({ _tag: 'InvalidPasswordError' }, (err) => ({
      type: Event.ON_INVALID_PASSWORD,
      remainingAttempts: err.remainingAttempts,
      error: err.message,
    })),
    Match.when({ _tag: 'SamePasswordError' }, (err) => ({
      type: Event.ON_PASSWORD_UPDATE_ERROR,
      error: err.message,
    })),
    Match.orElse((err) => ({ type: Event.ON_PASSWORD_UPDATE_ERROR, error: extractErrorMessage(err) })),
  );
}

/**
 * Handles errors from delete account operations using pattern matching.
 */
function handleDeleteAccountError(error: DeleteAccountError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'TooManyRequestsError' }, (err) => ({
      type: Event.ON_RATE_LIMITED,
      retryAfter: err.retryAfter,
    })),
    Match.when({ _tag: 'InvalidPasswordError' }, (err) => ({
      type: Event.ON_INVALID_PASSWORD,
      remainingAttempts: err.remainingAttempts,
      error: err.message,
    })),
    Match.orElse((err) => ({ type: Event.ON_DELETE_ACCOUNT_ERROR, error: extractErrorMessage(err) })),
  );
}

const updateEmailLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) =>
  runWithUi(
    programUpdateEmail(input.email, input.password),
    (result) => {
      sendBack({ type: Event.ON_EMAIL_UPDATE_SUCCESS, result });
    },
    (error) => {
      sendBack(handleUpdateEmailError(error));
    },
  )
);

const updatePasswordLogic = fromCallback<EventObject, { currentPassword: string; newPassword: string }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePassword(input.currentPassword, input.newPassword),
      (result) => {
        sendBack({ type: Event.ON_PASSWORD_UPDATE_SUCCESS, result });
      },
      (error) => {
        sendBack(handleUpdatePasswordError(error));
      },
    ),
);

const deleteAccountLogic = fromCallback<EventObject, { password: string }>(({ sendBack, input }) =>
  runWithUi(
    programDeleteAccount(input.password),
    () => {
      sendBack({ type: Event.ON_DELETE_ACCOUNT_SUCCESS });
    },
    (error) => {
      sendBack(handleDeleteAccountError(error));
    },
  )
);

export const accountMachine = setup({
  types: {
    context: {} as AccountContext,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    emitEmailUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_EMAIL_UPDATE_SUCCESS);
      return {
        type: Emit.EMAIL_UPDATED,
        result: event.result,
      };
    }),
    emitEmailUpdateError: emit(({ event }) => {
      assertEvent(event, Event.ON_EMAIL_UPDATE_ERROR);
      return {
        type: Emit.EMAIL_UPDATE_ERROR,
        error: event.error,
      };
    }),
    emitPasswordUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_PASSWORD_UPDATE_SUCCESS);
      return {
        type: Emit.PASSWORD_UPDATED,
        result: event.result,
      };
    }),
    emitPasswordUpdateError: emit(({ event }) => {
      assertEvent(event, Event.ON_PASSWORD_UPDATE_ERROR);
      return {
        type: Emit.PASSWORD_UPDATE_ERROR,
        error: event.error,
      };
    }),
    emitAccountDeleted: emit(() => ({
      type: Emit.ACCOUNT_DELETED,
    })),
    emitAccountDeleteError: emit(({ event }) => {
      assertEvent(event, Event.ON_DELETE_ACCOUNT_ERROR);
      return {
        type: Emit.ACCOUNT_DELETE_ERROR,
        error: event.error,
      };
    }),
    emitRateLimited: emit(({ event }) => {
      assertEvent(event, Event.ON_RATE_LIMITED);
      return {
        type: Emit.RATE_LIMITED,
        retryAfter: event.retryAfter,
      };
    }),
    emitInvalidPassword: emit(({ event }) => {
      assertEvent(event, Event.ON_INVALID_PASSWORD);
      return {
        type: Emit.INVALID_PASSWORD,
        remainingAttempts: event.remainingAttempts,
        error: event.error,
      };
    }),
    setRateLimited: assign(({ event }) => {
      assertEvent(event, Event.ON_RATE_LIMITED);
      return {
        remainingAttempts: 0,
        blockedUntil: Date.now() + event.retryAfter * 1000,
      };
    }),
    setRemainingAttempts: assign(({ event }) => {
      assertEvent(event, Event.ON_INVALID_PASSWORD);

      if (event.remainingAttempts === 0) {
        return {
          remainingAttempts: 0,
          blockedUntil: Date.now() + LOCKOUT_DURATION_SECONDS * 1000,
        };
      }

      return {
        remainingAttempts: event.remainingAttempts,
        blockedUntil: null,
      };
    }),
    resetRateLimit: assign(() => ({
      remainingAttempts: MAX_PASSWORD_ATTEMPTS,
      blockedUntil: null,
    })),
  },
  guards: {
    isNotBlocked: ({ context }) => {
      return context.blockedUntil === null || Date.now() >= context.blockedUntil;
    },
  },
  actors: {
    updateEmailActor: updateEmailLogic,
    updatePasswordActor: updatePasswordLogic,
    deleteAccountActor: deleteAccountLogic,
  },
}).createMachine({
  id: 'account',
  initial: AccountState.Idle,
  context: {
    remainingAttempts: MAX_PASSWORD_ATTEMPTS,
    blockedUntil: null,
  },
  states: {
    [AccountState.Idle]: {
      on: {
        [Event.UPDATE_EMAIL]: {
          target: AccountState.UpdatingEmail,
          guard: 'isNotBlocked',
        },
        [Event.UPDATE_PASSWORD]: {
          target: AccountState.UpdatingPassword,
          guard: 'isNotBlocked',
        },
        [Event.DELETE_ACCOUNT]: {
          target: AccountState.DeletingAccount,
          guard: 'isNotBlocked',
        },
        [Event.RESET_RATE_LIMIT]: {
          actions: ['resetRateLimit'],
        },
      },
    },
    [AccountState.UpdatingEmail]: {
      invoke: {
        id: 'updateEmailActor',
        src: 'updateEmailActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_EMAIL);
          return { email: event.email, password: event.password };
        },
      },
      on: {
        [Event.ON_EMAIL_UPDATE_SUCCESS]: {
          actions: ['resetRateLimit', 'emitEmailUpdated'],
          target: AccountState.Idle,
        },
        [Event.ON_EMAIL_UPDATE_ERROR]: {
          actions: ['emitEmailUpdateError'],
          target: AccountState.Idle,
        },
        [Event.ON_RATE_LIMITED]: {
          actions: ['setRateLimited', 'emitRateLimited'],
          target: AccountState.Idle,
        },
        [Event.ON_INVALID_PASSWORD]: {
          actions: ['setRemainingAttempts', 'emitInvalidPassword'],
          target: AccountState.Idle,
        },
      },
    },
    [AccountState.UpdatingPassword]: {
      invoke: {
        id: 'updatePasswordActor',
        src: 'updatePasswordActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_PASSWORD);
          return { currentPassword: event.currentPassword, newPassword: event.newPassword };
        },
      },
      on: {
        [Event.ON_PASSWORD_UPDATE_SUCCESS]: {
          actions: ['resetRateLimit', 'emitPasswordUpdated'],
          target: AccountState.Idle,
        },
        [Event.ON_PASSWORD_UPDATE_ERROR]: {
          actions: ['emitPasswordUpdateError'],
          target: AccountState.Idle,
        },
        [Event.ON_RATE_LIMITED]: {
          actions: ['setRateLimited', 'emitRateLimited'],
          target: AccountState.Idle,
        },
        [Event.ON_INVALID_PASSWORD]: {
          actions: ['setRemainingAttempts', 'emitInvalidPassword'],
          target: AccountState.Idle,
        },
      },
    },
    [AccountState.DeletingAccount]: {
      invoke: {
        id: 'deleteAccountActor',
        src: 'deleteAccountActor',
        input: ({ event }) => {
          assertEvent(event, Event.DELETE_ACCOUNT);
          return { password: event.password };
        },
      },
      on: {
        [Event.ON_DELETE_ACCOUNT_SUCCESS]: {
          actions: ['emitAccountDeleted'],
          target: AccountState.Idle,
        },
        [Event.ON_DELETE_ACCOUNT_ERROR]: {
          actions: ['emitAccountDeleteError'],
          target: AccountState.Idle,
        },
        [Event.ON_RATE_LIMITED]: {
          actions: ['setRateLimited', 'emitRateLimited'],
          target: AccountState.Idle,
        },
        [Event.ON_INVALID_PASSWORD]: {
          actions: ['setRemainingAttempts', 'emitInvalidPassword'],
          target: AccountState.Idle,
        },
      },
    },
  },
});

// Create a singleton actor instance
export const accountActor = createActor(accountMachine);
