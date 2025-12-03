import { runWithUi } from '@/utils/effects/helpers';
import { LOCKOUT_DURATION_SECONDS, MAX_PASSWORD_ATTEMPTS } from '@ketone/shared';
import { assertEvent, assign, createActor, emit, fromCallback, setup, type EventObject } from 'xstate';
import { updateEmailProgram, type UpdateEmailSuccess } from '../services/account.service';

export enum AccountState {
  Idle = 'Idle',
  Updating = 'Updating',
}

export enum Event {
  UPDATE_EMAIL = 'UPDATE_EMAIL',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_UPDATE_ERROR = 'ON_UPDATE_ERROR',
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
  | { type: Event.ON_UPDATE_SUCCESS; result: UpdateEmailSuccess }
  | { type: Event.ON_UPDATE_ERROR; error: string }
  | { type: Event.ON_RATE_LIMITED; retryAfter: number }
  | { type: Event.ON_INVALID_PASSWORD; remainingAttempts: number; error: string }
  | { type: Event.RESET_RATE_LIMIT };

export enum Emit {
  EMAIL_UPDATED = 'EMAIL_UPDATED',
  EMAIL_UPDATE_ERROR = 'EMAIL_UPDATE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  PASSWORD_ERROR = 'PASSWORD_ERROR',
}

export type EmitType =
  | { type: Emit.EMAIL_UPDATED; result: UpdateEmailSuccess }
  | { type: Emit.EMAIL_UPDATE_ERROR; error: string }
  | { type: Emit.RATE_LIMITED; retryAfter: number }
  | { type: Emit.PASSWORD_ERROR; remainingAttempts: number; error: string };

const updateEmailLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) => {
  runWithUi(
    updateEmailProgram(input.email, input.password),
    (result) => {
      sendBack({ type: Event.ON_UPDATE_SUCCESS, result });
    },
    (error) => {
      if ('_tag' in error && error._tag === 'TooManyRequestsError') {
        const rateLimitError = error as { retryAfter: number };
        sendBack({ type: Event.ON_RATE_LIMITED, retryAfter: rateLimitError.retryAfter });
        return;
      }
      if ('_tag' in error && error._tag === 'InvalidPasswordError') {
        const passwordError = error as { message: string; remainingAttempts: number };
        sendBack({
          type: Event.ON_INVALID_PASSWORD,
          remainingAttempts: passwordError.remainingAttempts,
          error: passwordError.message,
        });
        return;
      }
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_UPDATE_ERROR, error: errorMessage });
    },
  );
});

export const accountMachine = setup({
  types: {
    context: {} as AccountContext,
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
    emitRateLimited: emit(({ event }) => {
      assertEvent(event, Event.ON_RATE_LIMITED);
      return {
        type: Emit.RATE_LIMITED,
        retryAfter: event.retryAfter,
      };
    }),
    emitPasswordError: emit(({ event }) => {
      assertEvent(event, Event.ON_INVALID_PASSWORD);
      return {
        type: Emit.PASSWORD_ERROR,
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
      // When no attempts remaining, also set blockedUntil to show the rate limit UI
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
  actors: {
    updateEmailActor: updateEmailLogic,
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
        [Event.UPDATE_EMAIL]: AccountState.Updating,
        [Event.RESET_RATE_LIMIT]: {
          actions: ['resetRateLimit'],
        },
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
          actions: ['resetRateLimit', 'emitEmailUpdated'],
          target: AccountState.Idle,
        },
        [Event.ON_UPDATE_ERROR]: {
          actions: ['emitEmailUpdateError'],
          target: AccountState.Idle,
        },
        [Event.ON_RATE_LIMITED]: {
          actions: ['setRateLimited', 'emitRateLimited'],
          target: AccountState.Idle,
        },
        [Event.ON_INVALID_PASSWORD]: {
          actions: ['setRemainingAttempts', 'emitPasswordError'],
          target: AccountState.Idle,
        },
      },
    },
  },
});

// Create a singleton actor instance
export const accountActor = createActor(accountMachine);
