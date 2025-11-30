import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  getProfileProgram,
  saveProfileProgram,
  type GetProfileSuccess,
  type SaveProfileSuccess,
} from '../services/profile.service';

export enum ProfileState {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Saving = 'Saving',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  SAVE = 'SAVE',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_LOAD_ERROR = 'ON_LOAD_ERROR',
  ON_SAVE_SUCCESS = 'ON_SAVE_SUCCESS',
  ON_SAVE_ERROR = 'ON_SAVE_ERROR',
}

type EventType =
  | { type: Event.LOAD }
  | { type: Event.SAVE; data: { name?: string | null; dateOfBirth?: string | null } }
  | { type: Event.ON_LOAD_SUCCESS; profile: GetProfileSuccess }
  | { type: Event.ON_LOAD_ERROR; error: string }
  | { type: Event.ON_SAVE_SUCCESS; profile: SaveProfileSuccess }
  | { type: Event.ON_SAVE_ERROR; error: string };

export enum Emit {
  PROFILE_LOADED = 'PROFILE_LOADED',
  PROFILE_SAVED = 'PROFILE_SAVED',
  PROFILE_ERROR = 'PROFILE_ERROR',
}

export type EmitType =
  | { type: Emit.PROFILE_LOADED; profile: GetProfileSuccess }
  | { type: Emit.PROFILE_SAVED; profile: SaveProfileSuccess }
  | { type: Emit.PROFILE_ERROR; error: string };

type Context = {
  profile: GetProfileSuccess;
};

const getProfileLogic = fromCallback<EventObject>(({ sendBack }) => {
  runWithUi(
    getProfileProgram(),
    (profile) => {
      sendBack({ type: Event.ON_LOAD_SUCCESS, profile });
    },
    (error) => {
      const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
      sendBack({ type: Event.ON_LOAD_ERROR, error: errorMessage });
    },
  );
});

const saveProfileLogic = fromCallback<EventObject, { name?: string | null; dateOfBirth?: string | null }>(
  ({ sendBack, input }) => {
    runWithUi(
      saveProfileProgram(input),
      (profile) => {
        sendBack({ type: Event.ON_SAVE_SUCCESS, profile });
      },
      (error) => {
        const errorMessage = 'message' in error && typeof error.message === 'string' ? error.message : String(error);
        sendBack({ type: Event.ON_SAVE_ERROR, error: errorMessage });
      },
    );
  },
);

export const profileMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setProfile: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return {
        profile: event.profile,
      };
    }),
    updateProfile: assign(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return {
        profile: event.profile,
      };
    }),
    emitProfileLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return {
        type: Emit.PROFILE_LOADED,
        profile: event.profile,
      };
    }),
    emitProfileSaved: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return {
        type: Emit.PROFILE_SAVED,
        profile: event.profile,
      };
    }),
    emitLoadError: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_ERROR);
      return {
        type: Emit.PROFILE_ERROR,
        error: event.error,
      };
    }),
    emitSaveError: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_ERROR);
      return {
        type: Emit.PROFILE_ERROR,
        error: event.error,
      };
    }),
  },
  actors: {
    getProfileActor: getProfileLogic,
    saveProfileActor: saveProfileLogic,
  },
}).createMachine({
  id: 'profile',
  context: {
    profile: null,
  },
  initial: ProfileState.Idle,
  states: {
    [ProfileState.Idle]: {
      on: {
        [Event.LOAD]: ProfileState.Loading,
      },
    },
    [ProfileState.Loading]: {
      invoke: {
        id: 'getProfileActor',
        src: 'getProfileActor',
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['setProfile', 'emitProfileLoaded'],
          target: ProfileState.Loaded,
        },
        [Event.ON_LOAD_ERROR]: {
          actions: 'emitLoadError',
          target: ProfileState.Error,
        },
      },
    },
    [ProfileState.Loaded]: {
      on: {
        [Event.SAVE]: ProfileState.Saving,
        [Event.LOAD]: ProfileState.Loading,
      },
    },
    [ProfileState.Saving]: {
      invoke: {
        id: 'saveProfileActor',
        src: 'saveProfileActor',
        input: ({ event }) => {
          assertEvent(event, Event.SAVE);
          return event.data;
        },
      },
      on: {
        [Event.ON_SAVE_SUCCESS]: {
          actions: ['updateProfile', 'emitProfileSaved'],
          target: ProfileState.Loaded,
        },
        [Event.ON_SAVE_ERROR]: {
          actions: 'emitSaveError',
          target: ProfileState.Loaded,
        },
      },
    },
    [ProfileState.Error]: {
      on: {
        [Event.LOAD]: ProfileState.Loading,
      },
    },
  },
});
