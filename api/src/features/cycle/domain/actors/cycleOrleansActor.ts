import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup } from 'xstate';
import { programCreateCycle, programUpdateCycleStatus, runWithUi } from '../../repositories';

/**
 * Cycle Actor
 *
 * XState machine for orchestrating cycle creation with Orleans sidecar.
 * This machine runs locally in the Effect/Bun server and orchestrates:
 * 1. Creating the cycle in the database
 * 2. State persistence is handled externally by Orleans sidecar
 */

export enum CycleState {
  Idle = 'Idle',
  Creating = 'Creating',
  InProgress = 'InProgress',
  Completing = 'Completing',
  Completed = 'Completed',
}

export enum CycleEvent {
  CREATE_CYCLE = 'CREATE_CYCLE',
  SUCCESS = 'SUCCESS',
  PERSIST_SUCCESS = 'PERSIST_SUCCESS',
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  ERROR = 'ERROR',
  RESET = 'RESET',
  COMPLETE = 'COMPLETE',
}

export enum Emit {
  ERROR_CREATE_CYCLE = 'ERROR_CREATE_CYCLE',
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  PERSIST_STATE = 'PERSIST_STATE',
}

type CycleEventType =
  | { type: CycleEvent.CREATE_CYCLE; userId: string; startDate: Date; endDate: Date }
  | { type: CycleEvent.SUCCESS; id: string; userId: string; startDate: Date; endDate: Date }
  | { type: CycleEvent.PERSIST_SUCCESS }
  | { type: CycleEvent.REPOSITORY_ERROR; summary: string; detail: string }
  | { type: CycleEvent.ERROR; summary: string; detail: string }
  | { type: CycleEvent.RESET }
  | { type: CycleEvent.COMPLETE; startDate: Date; endDate: Date };

type Context = {
  id: string | null;
  userId: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type EmitType =
  | { type: Emit.ERROR_CREATE_CYCLE; error: Error }
  | { type: Emit.REPOSITORY_ERROR; error: Error }
  | { type: Emit.PERSIST_STATE; state: CycleState };

// ============================================================================
// ACTOR SETUP
// ============================================================================

export const cycleActor = setup({
  types: {
    context: {} as Context,
    events: {} as CycleEventType,
    emitted: {} as EmitType,
  },
  actions: {
    resetContext: assign({
      id: null,
      userId: null,
      startDate: null,
      endDate: null,
    }),
    onCycleSuccess: assign({
      id: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        console.log('✅ [Orleans] Cycle created with ID:', event.id);
        return event.id;
      },
      userId: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        return event.userId;
      },
      startDate: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        return event.startDate;
      },
      endDate: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        return event.endDate;
      },
    }),
    onComplete: assign({
      startDate: ({ event }) => {
        assertEvent(event, CycleEvent.COMPLETE);
        console.log('✅ [Orleans] Updating cycle dates on completion');
        return event.startDate;
      },
      endDate: ({ event }) => {
        assertEvent(event, CycleEvent.COMPLETE);
        return event.endDate;
      },
    }),
    emitError: emit(({ event }) => {
      assertEvent(event, CycleEvent.ERROR);
      return {
        type: Emit.ERROR_CREATE_CYCLE,
        error: new Error(`${event.summary}: ${event.detail}`),
      } as const;
    }),
    emitRepositoryError: emit(({ event }) => {
      assertEvent(event, CycleEvent.REPOSITORY_ERROR);
      return {
        type: Emit.REPOSITORY_ERROR,
        error: new Error(`${event.summary}: ${event.detail}`),
      } as const;
    }),
    emitPersistInProgress: emit(
      () =>
        ({
          type: Emit.PERSIST_STATE,
          state: CycleState.InProgress,
        } as const),
    ),
    emitPersistCompleted: emit(
      () =>
        ({
          type: Emit.PERSIST_STATE,
          state: CycleState.Completed,
        } as const),
    ),
  },
  actors: {
    createCycle: fromCallback(({ sendBack, input }) => {
      const { userId, startDate, endDate } = input as {
        userId: string;
        startDate: Date;
        endDate: Date;
      };

      runWithUi(
        programCreateCycle({
          userId,
          status: CycleState.InProgress,
          startDate,
          endDate,
        }),
        (cycle) => {
          console.log('✅ [Orleans] Cycle created successfully:', cycle.id);
          sendBack({
            type: CycleEvent.SUCCESS,
            id: cycle.id,
            userId: cycle.userId,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
          });
        },
        (error) => {
          Match.value(error).pipe(
            Match.when({ _tag: 'CycleRepositoryError' }, (err) => {
              sendBack({
                type: CycleEvent.REPOSITORY_ERROR,
                summary: 'Repository Error',
                detail: err.message,
              });
            }),
            Match.orElse(() => {
              sendBack({
                type: CycleEvent.ERROR,
                summary: 'Unexpected Error',
                detail: 'An unexpected error occurred while creating cycle',
              });
            }),
          );
        },
      );

      return () => {};
    }),
    updateCycleStatus: fromCallback(({ sendBack, input }) => {
      const { cycleId } = input as {
        cycleId: string;
      };

      runWithUi(
        programUpdateCycleStatus(cycleId, CycleState.Completed),
        (cycle) => {
          console.log('✅ [Orleans] Cycle status updated successfully:', cycle.id);
          sendBack({
            type: CycleEvent.PERSIST_SUCCESS,
          });
        },
        (error) => {
          Match.value(error).pipe(
            Match.when({ _tag: 'CycleRepositoryError' }, (err) => {
              sendBack({
                type: CycleEvent.REPOSITORY_ERROR,
                summary: 'Repository Error',
                detail: err.message,
              });
            }),
            Match.orElse(() => {
              sendBack({
                type: CycleEvent.ERROR,
                summary: 'Unexpected Error',
                detail: 'An unexpected error occurred while updating cycle status',
              });
            }),
          );
        },
      );

      return () => {};
    }),
  },
}).createMachine({
  id: 'cycle',
  initial: CycleState.Idle,
  context: {
    id: null,
    userId: null,
    startDate: null,
    endDate: null,
  },
  states: {
    [CycleState.Idle]: {
      entry: ['resetContext'],
      on: {
        [CycleEvent.CREATE_CYCLE]: {
          target: CycleState.Creating,
        },
      },
    },
    [CycleState.Creating]: {
      invoke: {
        id: 'createCycle',
        src: 'createCycle',
        input: ({ event }) => {
          assertEvent(event, CycleEvent.CREATE_CYCLE);
          return {
            userId: event.userId,
            startDate: event.startDate,
            endDate: event.endDate,
          };
        },
      },
      on: {
        [CycleEvent.SUCCESS]: {
          target: CycleState.InProgress,
          actions: ['onCycleSuccess'],
        },
        [CycleEvent.REPOSITORY_ERROR]: {
          target: CycleState.Idle,
          actions: ['emitRepositoryError'],
        },
        [CycleEvent.ERROR]: {
          target: CycleState.Idle,
          actions: ['emitError'],
        },
      },
    },
    [CycleState.InProgress]: {
      entry: ['emitPersistInProgress'],
      on: {
        [CycleEvent.RESET]: {
          target: CycleState.Idle,
        },
        [CycleEvent.COMPLETE]: {
          target: CycleState.Completing,
          actions: ['onComplete'],
        },
      },
    },
    [CycleState.Completing]: {
      invoke: {
        id: 'updateCycleStatus',
        src: 'updateCycleStatus',
        input: ({ context }) => {
          return {
            cycleId: context.id,
          };
        },
      },
      on: {
        [CycleEvent.PERSIST_SUCCESS]: {
          target: CycleState.Completed,
        },
        [CycleEvent.REPOSITORY_ERROR]: {
          target: CycleState.InProgress,
          actions: ['emitRepositoryError'],
        },
        [CycleEvent.ERROR]: {
          target: CycleState.InProgress,
          actions: ['emitError'],
        },
      },
    },
    [CycleState.Completed]: {
      entry: ['emitPersistCompleted'],
      on: {
        [CycleEvent.RESET]: {
          target: CycleState.Idle,
        },
      },
    },
  },
});
