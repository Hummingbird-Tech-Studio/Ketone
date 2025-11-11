import { programCheckToken, programRemoveToken, programStoreToken } from '@/services/auth/auth-token.service';
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
}

type EventType =
  | { type: Event.CHECK_AUTH }
  | { type: Event.AUTHENTICATE; token: string; user: UserResponseSchema }
  | { type: Event.DEAUTHENTICATE }
  | { type: Event.RETRY }
  | { type: Event.AUTH_CHECK_SUCCESS; token: string }
  | { type: Event.AUTH_CHECK_FAILURE }
  | { type: Event.AUTH_SUCCESS }
  | { type: Event.AUTH_FAILURE; error: string }
  | { type: Event.DEAUTH_COMPLETE };

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
    storeToken: assign({
      token: ({ event }) => {
        assertEvent(event, Event.AUTH_CHECK_SUCCESS);
        return event.token;
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
  },
  actors: {
    checkAuthToken: fromCallback(({ sendBack }) => {
      runWithUi(
        programCheckToken,
        (token) => {
          if (token) {
            sendBack({ type: Event.AUTH_CHECK_SUCCESS, token });
          } else {
            sendBack({ type: Event.AUTH_CHECK_FAILURE });
          }
        },
        () => {
          sendBack({ type: Event.AUTH_CHECK_FAILURE });
        },
      );
    }),
    storeAuthToken: fromCallback<EventType, { token: string; user: UserResponseSchema }>(({ sendBack, input }) => {
      runWithUi(
        programStoreToken(input.token),
        () => {
          sendBack({ type: Event.AUTH_SUCCESS });
        },
        (error) => {
          sendBack({
            type: Event.AUTH_FAILURE,
            error: error instanceof Error ? error.message : 'Failed to store token',
          });
        },
      );
    }),
    removeAuthToken: fromCallback(({ sendBack }) => {
      runWithUi(
        programRemoveToken,
        () => {
          sendBack({ type: Event.DEAUTH_COMPLETE });
        },
        (error) => {
          console.error('Failed to remove token:', error);
          // Even if removal fails, we clear the context
          sendBack({ type: Event.DEAUTH_COMPLETE });
        },
      );
    }),
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
        id: 'checkAuthToken',
        src: 'checkAuthToken',
      },
      on: {
        [Event.AUTH_CHECK_SUCCESS]: {
          target: State.AUTHENTICATED,
          actions: ['storeToken'],
        },
        [Event.AUTH_CHECK_FAILURE]: {
          target: State.UNAUTHENTICATED,
        },
      },
    },
    [State.AUTHENTICATING]: {
      invoke: {
        id: 'storeAuth',
        src: 'storeAuthToken',
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
        [Event.DEAUTHENTICATE]: {
          target: State.DEAUTHENTICATING,
        },
      },
    },
    [State.DEAUTHENTICATING]: {
      entry: ['clearAuthData'],
      invoke: {
        id: 'removeAuthToken',
        src: 'removeAuthToken',
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
