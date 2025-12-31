import { programCheckSession, programRemoveSession, programStoreSession } from '@/services/auth/auth-session.service';
import { runWithUi } from '@/utils/effects/helpers';
import type { UserResponseSchema } from '@ketone/shared';
import { assertEvent, assign, createActor, emit, fromCallback, setup } from 'xstate';

export enum State {
  INITIALIZING = 'INITIALIZING',
  AUTHENTICATING = 'AUTHENTICATING',
  AUTHENTICATED = 'AUTHENTICATED',
  DEAUTHENTICATING = 'DEAUTHENTICATING',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  ERROR = 'ERROR',
}

export enum Event {
  CHECK_AUTH = 'CHECK_AUTH',
  AUTHENTICATE = 'AUTHENTICATE',
  DEAUTHENTICATE = 'DEAUTHENTICATE',
  RETRY = 'RETRY',
  AUTH_CHECK_SUCCESS = 'AUTH_CHECK_SUCCESS',
  AUTH_CHECK_FAILURE = 'AUTH_CHECK_FAILURE',
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  DEAUTH_COMPLETE = 'DEAUTH_COMPLETE',
  UPDATE_USER_EMAIL = 'UPDATE_USER_EMAIL',
}

type EventType =
  | { type: Event.CHECK_AUTH }
  | { type: Event.AUTHENTICATE; token: string; user: UserResponseSchema }
  | { type: Event.DEAUTHENTICATE }
  | { type: Event.RETRY }
  | { type: Event.AUTH_CHECK_SUCCESS; token: string; user: UserResponseSchema }
  | { type: Event.AUTH_CHECK_FAILURE }
  | { type: Event.AUTH_SUCCESS }
  | { type: Event.AUTH_FAILURE; error: string }
  | { type: Event.DEAUTH_COMPLETE }
  | { type: Event.UPDATE_USER_EMAIL; email: string };

// Output Events (Emits)
export enum Emit {
  AUTHENTICATED = 'AUTHENTICATED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
}

export type EmitType =
  | { type: Emit.AUTHENTICATED; token: string; user: UserResponseSchema }
  | { type: Emit.UNAUTHENTICATED }
  | { type: Emit.AUTHENTICATION_ERROR; error: string };

// Context
type Context = {
  token: string | null;
  user: UserResponseSchema | null;
};

// XState Machine Definition
export const authenticationMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    storeAuthData: assign({
      token: ({ event }) => {
        assertEvent(event, Event.AUTHENTICATE);
        return event.token;
      },
      user: ({ event }) => {
        assertEvent(event, Event.AUTHENTICATE);
        return event.user;
      },
    }),
    storeSessionData: assign({
      token: ({ event }) => {
        assertEvent(event, Event.AUTH_CHECK_SUCCESS);
        return event.token;
      },
      user: ({ event }) => {
        assertEvent(event, Event.AUTH_CHECK_SUCCESS);
        return event.user;
      },
    }),
    clearAuthData: assign({
      token: null,
      user: null,
    }),
    emitAuthenticated: emit(
      ({ context }) =>
        ({
          type: Emit.AUTHENTICATED,
          token: context.token!,
          user: context.user!,
        }) as const,
    ),
    emitUnauthenticated: emit(
      () =>
        ({
          type: Emit.UNAUTHENTICATED,
        }) as const,
    ),
    emitAuthenticationError: emit(({ event }) => {
      assertEvent(event, Event.AUTH_FAILURE);
      return {
        type: Emit.AUTHENTICATION_ERROR,
        error: event.error,
      } as const;
    }),
    updateUserEmail: assign({
      user: ({ context, event }) => {
        assertEvent(event, Event.UPDATE_USER_EMAIL);
        return context.user ? { ...context.user, email: event.email } : null;
      },
    }),
  },
  actors: {
    checkAuthSession: fromCallback(({ sendBack }) =>
      runWithUi(
        programCheckSession,
        (session) => {
          if (session) {
            sendBack({ type: Event.AUTH_CHECK_SUCCESS, token: session.token, user: session.user });
          } else {
            sendBack({ type: Event.AUTH_CHECK_FAILURE });
          }
        },
        () => {
          sendBack({ type: Event.AUTH_CHECK_FAILURE });
        },
      )
    ),
    storeAuthSession: fromCallback<EventType, { token: string; user: UserResponseSchema }>(({ sendBack, input }) =>
      runWithUi(
        programStoreSession({ token: input.token, user: input.user }),
        () => {
          sendBack({ type: Event.AUTH_SUCCESS });
        },
        (error) => {
          console.error('[Auth Actor] Failed to store session:', error.message, error.cause);
          sendBack({
            type: Event.AUTH_FAILURE,
            error: error.message,
          });
        },
      )
    ),
    removeAuthSession: fromCallback(({ sendBack }) =>
      runWithUi(
        programRemoveSession,
        () => {
          sendBack({ type: Event.DEAUTH_COMPLETE });
        },
        (error) => {
          console.error('[Auth Actor] Failed to remove session:', error.message, error.cause);
          sendBack({ type: Event.DEAUTH_COMPLETE });
        },
      )
    ),
  },
}).createMachine({
  id: 'authentication',
  context: {
    token: null,
    user: null,
  },
  initial: State.INITIALIZING,
  states: {
    [State.INITIALIZING]: {
      invoke: {
        id: 'checkAuthSession',
        src: 'checkAuthSession',
      },
      on: {
        [Event.AUTH_CHECK_SUCCESS]: {
          target: State.AUTHENTICATED,
          actions: ['storeSessionData'],
        },
        [Event.AUTH_CHECK_FAILURE]: {
          target: State.UNAUTHENTICATED,
        },
      },
    },
    [State.AUTHENTICATING]: {
      invoke: {
        id: 'storeAuthSession',
        src: 'storeAuthSession',
        input: ({ context }) => ({
          token: context.token!,
          user: context.user!,
        }),
      },
      on: {
        [Event.AUTH_SUCCESS]: {
          target: State.AUTHENTICATED,
          actions: ['emitAuthenticated'],
        },
        [Event.AUTH_FAILURE]: {
          target: State.ERROR,
          actions: ['emitAuthenticationError'],
        },
      },
    },
    [State.AUTHENTICATED]: {
      on: {
        [Event.AUTHENTICATE]: {
          actions: ['storeAuthData', 'emitAuthenticated'],
        },
        [Event.DEAUTHENTICATE]: {
          target: State.DEAUTHENTICATING,
        },
        [Event.UPDATE_USER_EMAIL]: {
          actions: ['updateUserEmail'],
        },
      },
    },
    [State.DEAUTHENTICATING]: {
      entry: ['clearAuthData'],
      invoke: {
        id: 'removeAuthSession',
        src: 'removeAuthSession',
      },
      on: {
        [Event.DEAUTH_COMPLETE]: {
          target: State.UNAUTHENTICATED,
          actions: ['emitUnauthenticated'],
        },
      },
    },
    [State.UNAUTHENTICATED]: {
      on: {
        [Event.AUTHENTICATE]: {
          target: State.AUTHENTICATING,
          actions: ['storeAuthData'],
        },
        [Event.CHECK_AUTH]: {
          target: State.INITIALIZING,
        },
      },
    },
    [State.ERROR]: {
      on: {
        [Event.RETRY]: {
          target: State.AUTHENTICATING,
        },
        [Event.AUTHENTICATE]: {
          target: State.AUTHENTICATING,
          actions: ['storeAuthData'],
        },
      },
    },
  },
});

export const authenticationActor = createActor(authenticationMachine);
