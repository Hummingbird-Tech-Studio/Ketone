import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup } from 'xstate';
import { programPersistToOrleans, type OrleansActorState } from '../../infrastructure';
import { programCreateCycle, runWithUi } from '../../repositories';

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
  Completed = 'Completed',
}

export enum CycleEvent {
  CREATE_CYCLE = 'CREATE_CYCLE',
  SUCCESS = 'SUCCESS',
  PERSIST_SUCCESS = 'PERSIST_SUCCESS',
  PERSIST_ERROR = 'PERSIST_ERROR',
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  ERROR = 'ERROR',
  RESET = 'RESET',
  COMPLETE = 'COMPLETE',
}

export enum Emit {
  ERROR_CREATE_CYCLE = 'ERROR_CREATE_CYCLE',
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  PERSIST_ERROR = 'PERSIST_ERROR',
  PERSIST_STATE = 'PERSIST_STATE',
}

type CycleEventType =
  | { type: CycleEvent.CREATE_CYCLE; actorId: string; startDate: Date; endDate: Date }
  | { type: CycleEvent.SUCCESS; id: string; actorId: string; startDate: Date; endDate: Date }
  | { type: CycleEvent.PERSIST_SUCCESS }
  | { type: CycleEvent.PERSIST_ERROR; summary: string; detail: string }
  | { type: CycleEvent.REPOSITORY_ERROR; summary: string; detail: string }
  | { type: CycleEvent.ERROR; summary: string; detail: string }
  | { type: CycleEvent.RESET }
  | { type: CycleEvent.COMPLETE; startDate: Date; endDate: Date };

type Context = {
  id: string | null;
  actorId: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type EmitType =
  | { type: Emit.ERROR_CREATE_CYCLE; error: Error }
  | { type: Emit.REPOSITORY_ERROR; error: Error }
  | { type: Emit.PERSIST_ERROR; error: Error }
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
      actorId: null,
      startDate: null,
      endDate: null,
    }),
    onCycleSuccess: assign({
      id: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        console.log('✅ [Orleans] Cycle created with ID:', event.id);
        return event.id;
      },
      actorId: ({ event }) => {
        assertEvent(event, CycleEvent.SUCCESS);
        return event.actorId;
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
      const { actorId, startDate, endDate } = input as {
        actorId: string;
        startDate: Date;
        endDate: Date;
      };
      runWithUi(
        programCreateCycle({
          actorId,
          startDate,
          endDate,
        }),
        (cycle) => {
          console.log('✅ [Orleans] Cycle created successfully:', cycle.id);
          sendBack({
            type: CycleEvent.SUCCESS,
            id: cycle.id,
            actorId: cycle.actorId,
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
    persistToOrleans: fromCallback(({ sendBack, input }) => {
      const { actorId, state } = input as {
        actorId: string;
        state: OrleansActorState;
      };

      console.log('[Orleans Machine] Persisting to Orleans...', { actorId, state });

      runWithUi(
        programPersistToOrleans(actorId, state),
        () => {
          console.log('✅ [Orleans Machine] State persisted successfully');
          sendBack({ type: CycleEvent.PERSIST_SUCCESS });
        },
        (error: any) => {
          console.error('❌ [Orleans Machine] Failed to persist:', error);
          sendBack({
            type: CycleEvent.PERSIST_ERROR,
            summary: 'Persist Error',
            detail: error.message || 'Failed to persist to Orleans',
          });
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
    actorId: null,
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
            actorId: event.actorId,
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
          target: CycleState.Completed,
          actions: ['onComplete'],
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
