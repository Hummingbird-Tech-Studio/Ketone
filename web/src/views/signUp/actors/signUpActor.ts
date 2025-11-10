import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { createActor } from 'xstate';
import { Option } from 'effect';
import router from '@/router';

type Session = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    app_metadata: {
      provider: string;
    };
    user_metadata: {
      provider: string;
    };
  };
};

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
  | { type: Event.ON_DONE; session: Option.Option<Session> };

export enum Emit {
  SIGN_UP_SUCCESS = 'SIGN_UP_SUCCESS',
  REDIRECT = 'REDIRECT',
}

type EmitType = { type: Emit.SIGN_UP_SUCCESS; session: Option.Option<Session> } | { type: Emit.REDIRECT };

type Context = {
  serviceError: string | null;
};

const signUpLogic = fromCallback<EventObject, { email: string; password: string }>(({ sendBack, input }) => {
  console.log(sendBack, input);
  //   const signUp = (email: string, password: string) =>
  //     programSignUp(email, password).pipe(
  //       Effect.matchEffect({
  //         onSuccess: (session) => Effect.sync(() => sendBack({ type: Event.ON_DONE, session })),
  //         onFailure: (error) => Effect.sync(() => sendBack({ type: Event.ON_ERROR, error: error.message })),
  //       }),
  //     );
  //   Effect.runPromiseExit(signUp(input.email, input.password));
});

const signUpMachine = setup({
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
        session: event.session,
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

export const signUpActor = createActor(signUpMachine);

signUpActor.on(Emit.REDIRECT, () => router.push('/'));
