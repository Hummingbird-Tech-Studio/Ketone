import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programGetPhysicalInfo,
  programSavePhysicalInfo,
  type GetPhysicalInfoSuccess,
  type SavePhysicalInfoPayload,
  type SavePhysicalInfoSuccess,
} from '../services/profile.service';

export enum PhysicalInfoState {
  Idle = 'Idle',
  Loading = 'Loading',
  Loaded = 'Loaded',
  Saving = 'Saving',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  REFRESH = 'REFRESH',
  SAVE = 'SAVE',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_LOAD_ERROR = 'ON_LOAD_ERROR',
  ON_SAVE_SUCCESS = 'ON_SAVE_SUCCESS',
  ON_SAVE_ERROR = 'ON_SAVE_ERROR',
}

type EventType =
  | { type: Event.LOAD }
  | { type: Event.REFRESH }
  | { type: Event.SAVE; data: SavePhysicalInfoPayload }
  | { type: Event.ON_LOAD_SUCCESS; physicalInfo: GetPhysicalInfoSuccess }
  | { type: Event.ON_LOAD_ERROR; error: string }
  | { type: Event.ON_SAVE_SUCCESS; physicalInfo: SavePhysicalInfoSuccess }
  | { type: Event.ON_SAVE_ERROR; error: string };

export enum Emit {
  PHYSICAL_INFO_LOADED = 'PHYSICAL_INFO_LOADED',
  PHYSICAL_INFO_SAVED = 'PHYSICAL_INFO_SAVED',
  PHYSICAL_INFO_ERROR = 'PHYSICAL_INFO_ERROR',
}

export type EmitType =
  | { type: Emit.PHYSICAL_INFO_LOADED; physicalInfo: GetPhysicalInfoSuccess }
  | { type: Emit.PHYSICAL_INFO_SAVED; physicalInfo: SavePhysicalInfoSuccess }
  | { type: Emit.PHYSICAL_INFO_ERROR; error: string };

type Context = {
  physicalInfo: GetPhysicalInfoSuccess;
};

const getPhysicalInfoLogic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programGetPhysicalInfo(),
    (physicalInfo) => {
      sendBack({ type: Event.ON_LOAD_SUCCESS, physicalInfo });
    },
    (error) => {
      sendBack({ type: Event.ON_LOAD_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

const savePhysicalInfoLogic = fromCallback<EventObject, SavePhysicalInfoPayload>(({ sendBack, input }) =>
  runWithUi(
    programSavePhysicalInfo(input),
    (physicalInfo) => {
      sendBack({ type: Event.ON_SAVE_SUCCESS, physicalInfo });
    },
    (error) => {
      sendBack({ type: Event.ON_SAVE_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

export const physicalInfoMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setPhysicalInfo: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return {
        physicalInfo: event.physicalInfo,
      };
    }),
    updatePhysicalInfo: assign(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return {
        physicalInfo: event.physicalInfo,
      };
    }),
    emitPhysicalInfoLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return {
        type: Emit.PHYSICAL_INFO_LOADED,
        physicalInfo: event.physicalInfo,
      };
    }),
    emitPhysicalInfoSaved: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_SUCCESS);
      return {
        type: Emit.PHYSICAL_INFO_SAVED,
        physicalInfo: event.physicalInfo,
      };
    }),
    emitLoadError: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_ERROR);
      return {
        type: Emit.PHYSICAL_INFO_ERROR,
        error: event.error,
      };
    }),
    emitSaveError: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_ERROR);
      return {
        type: Emit.PHYSICAL_INFO_ERROR,
        error: event.error,
      };
    }),
  },
  actors: {
    getPhysicalInfoActor: getPhysicalInfoLogic,
    savePhysicalInfoActor: savePhysicalInfoLogic,
  },
}).createMachine({
  id: 'physicalInfo',
  context: {
    physicalInfo: null,
  },
  initial: PhysicalInfoState.Idle,
  on: {
    [Event.REFRESH]: `.${PhysicalInfoState.Loading}`,
  },
  states: {
    [PhysicalInfoState.Idle]: {
      on: {
        [Event.LOAD]: PhysicalInfoState.Loading,
      },
    },
    [PhysicalInfoState.Loading]: {
      invoke: {
        id: 'getPhysicalInfoActor',
        src: 'getPhysicalInfoActor',
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['setPhysicalInfo', 'emitPhysicalInfoLoaded'],
          target: PhysicalInfoState.Loaded,
        },
        [Event.ON_LOAD_ERROR]: {
          actions: 'emitLoadError',
          target: PhysicalInfoState.Error,
        },
      },
    },
    [PhysicalInfoState.Loaded]: {
      on: {
        [Event.SAVE]: PhysicalInfoState.Saving,
        [Event.LOAD]: PhysicalInfoState.Loading,
      },
    },
    [PhysicalInfoState.Saving]: {
      invoke: {
        id: 'savePhysicalInfoActor',
        src: 'savePhysicalInfoActor',
        input: ({ event }) => {
          assertEvent(event, Event.SAVE);
          return event.data;
        },
      },
      on: {
        [Event.ON_SAVE_SUCCESS]: {
          actions: ['updatePhysicalInfo', 'emitPhysicalInfoSaved'],
          target: PhysicalInfoState.Loaded,
        },
        [Event.ON_SAVE_ERROR]: {
          actions: 'emitSaveError',
          target: PhysicalInfoState.Loaded,
        },
      },
    },
    [PhysicalInfoState.Error]: {
      on: {
        [Event.LOAD]: PhysicalInfoState.Loading,
      },
    },
  },
});
