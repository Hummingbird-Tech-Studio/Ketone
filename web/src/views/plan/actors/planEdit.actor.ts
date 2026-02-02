import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programGetLastCompletedCycle } from '@/views/cycle/services/cycle.service';
import type { AdjacentCycle, PlanWithPeriodsResponse } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programGetPlan,
  programUpdatePlanMetadata,
  programUpdatePlanPeriods,
  type GetPlanError,
  type GetPlanSuccess,
  type UpdatePeriodsError,
  type UpdatePeriodsPayload,
  type UpdatePeriodsSuccess,
  type UpdatePlanMetadataError,
  type UpdatePlanMetadataSuccess,
} from '../services/plan.service';

/**
 * Plan Edit Actor States
 */
export enum PlanEditState {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
  UpdatingName = 'UpdatingName',
  UpdatingDescription = 'UpdatingDescription',
  UpdatingStartDate = 'UpdatingStartDate',
  UpdatingPeriods = 'UpdatingPeriods',
  Error = 'Error',
}

/**
 * Plan Edit Actor Events
 */
export enum Event {
  LOAD = 'LOAD',
  UPDATE_NAME = 'UPDATE_NAME',
  UPDATE_DESCRIPTION = 'UPDATE_DESCRIPTION',
  UPDATE_START_DATE = 'UPDATE_START_DATE',
  UPDATE_PERIODS = 'UPDATE_PERIODS',
  // Callback events
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_ERROR = 'ON_ERROR',
  ON_PERIOD_OVERLAP_ERROR = 'ON_PERIOD_OVERLAP_ERROR',
  ON_PLAN_INVALID_STATE_ERROR = 'ON_PLAN_INVALID_STATE_ERROR',
  ON_LAST_COMPLETED_CYCLE_LOADED = 'ON_LAST_COMPLETED_CYCLE_LOADED',
}

type EventType =
  | { type: Event.LOAD; planId: string }
  | { type: Event.UPDATE_NAME; planId: string; name: string }
  | { type: Event.UPDATE_DESCRIPTION; planId: string; description: string }
  | { type: Event.UPDATE_START_DATE; planId: string; startDate: Date }
  | { type: Event.UPDATE_PERIODS; planId: string; payload: UpdatePeriodsPayload }
  | { type: Event.ON_LOAD_SUCCESS; result: GetPlanSuccess; lastCompletedCycle: AdjacentCycle | null }
  | { type: Event.ON_UPDATE_SUCCESS; result: UpdatePlanMetadataSuccess | UpdatePeriodsSuccess; updateType: UpdateType }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string }
  | { type: Event.ON_PLAN_INVALID_STATE_ERROR; message: string; currentState: string; expectedState: string }
  | { type: Event.ON_LAST_COMPLETED_CYCLE_LOADED; result: AdjacentCycle | null };

type UpdateType = 'name' | 'description' | 'startDate' | 'periods';

/**
 * Plan Edit Actor Emits
 */
export enum Emit {
  PLAN_LOADED = 'PLAN_LOADED',
  NAME_UPDATED = 'NAME_UPDATED',
  DESCRIPTION_UPDATED = 'DESCRIPTION_UPDATED',
  START_DATE_UPDATED = 'START_DATE_UPDATED',
  PERIODS_UPDATED = 'PERIODS_UPDATED',
  ERROR = 'ERROR',
  PERIOD_OVERLAP_ERROR = 'PERIOD_OVERLAP_ERROR',
  PLAN_INVALID_STATE_ERROR = 'PLAN_INVALID_STATE_ERROR',
}

export type EmitType =
  | { type: Emit.PLAN_LOADED; plan: PlanWithPeriodsResponse }
  | { type: Emit.NAME_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.DESCRIPTION_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.START_DATE_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.PERIODS_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.ERROR; error: string }
  | { type: Emit.PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string }
  | { type: Emit.PLAN_INVALID_STATE_ERROR; message: string; currentState: string; expectedState: string };

type Context = {
  plan: PlanWithPeriodsResponse | null;
  lastCompletedCycle: AdjacentCycle | null;
  error: string | null;
};

function getInitialContext(): Context {
  return {
    plan: null,
    lastCompletedCycle: null,
    error: null,
  };
}

/**
 * Handles errors from plan update operations
 */
function handleUpdateError(error: UpdatePlanMetadataError | UpdatePeriodsError | GetPlanError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'PlanNotFoundError' }, (err) => ({
      type: Event.ON_ERROR,
      error: err.message,
    })),
    Match.when({ _tag: 'PlanInvalidStateError' }, (err) => ({
      type: Event.ON_PLAN_INVALID_STATE_ERROR,
      message: err.message,
      currentState: err.currentState,
      expectedState: err.expectedState,
    })),
    Match.when({ _tag: 'PeriodOverlapWithCycleError' }, (err) => ({
      type: Event.ON_PERIOD_OVERLAP_ERROR,
      message: err.message,
      overlappingCycleId: err.overlappingCycleId,
    })),
    Match.orElse((err) => ({
      type: Event.ON_ERROR,
      error: extractErrorMessage(err),
    })),
  );
}

// Load plan logic - loads both plan and last completed cycle in parallel
const loadPlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) => {
  let plan: GetPlanSuccess | null = null;
  let lastCompletedCycle: AdjacentCycle | null = null;
  let loadedCount = 0;
  let hasError = false;

  const checkComplete = () => {
    loadedCount++;
    if (loadedCount === 2 && !hasError && plan) {
      sendBack({ type: Event.ON_LOAD_SUCCESS, result: plan, lastCompletedCycle });
    }
  };

  // Load plan
  runWithUi(
    programGetPlan(input.planId),
    (result) => {
      plan = result;
      checkComplete();
    },
    (error) => {
      if (!hasError) {
        hasError = true;
        sendBack(handleUpdateError(error));
      }
    },
  );

  // Load last completed cycle
  runWithUi(
    programGetLastCompletedCycle(),
    (result) => {
      lastCompletedCycle = result;
      checkComplete();
    },
    () => {
      // Don't fail if last completed cycle fails, just set to null
      lastCompletedCycle = null;
      checkComplete();
    },
  );
});

// Update name logic
const updateNameLogic = fromCallback<EventObject, { planId: string; name: string }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.planId, { name: input.name }),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'name' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

// Update description logic
const updateDescriptionLogic = fromCallback<EventObject, { planId: string; description: string }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePlanMetadata(input.planId, { description: input.description }),
      (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'description' }),
      (error) => sendBack(handleUpdateError(error)),
    ),
);

// Update start date logic
const updateStartDateLogic = fromCallback<EventObject, { planId: string; startDate: Date }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.planId, { startDate: input.startDate }),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'startDate' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

// Update periods logic
const updatePeriodsLogic = fromCallback<EventObject, { planId: string; payload: UpdatePeriodsPayload }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePlanPeriods(input.planId, input.payload),
      (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'periods' }),
      (error) => sendBack(handleUpdateError(error)),
    ),
);

export const planEditMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setPlan: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { plan: event.result, lastCompletedCycle: event.lastCompletedCycle, error: null };
    }),
    updatePlan: assign(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { plan: event.result, error: null };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { error: event.error };
    }),
    clearError: assign(() => ({ error: null })),
    // Emit actions
    emitPlanLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { type: Emit.PLAN_LOADED, plan: event.result };
    }),
    emitNameUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.NAME_UPDATED, plan: event.result };
    }),
    emitDescriptionUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.DESCRIPTION_UPDATED, plan: event.result };
    }),
    emitStartDateUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.START_DATE_UPDATED, plan: event.result };
    }),
    emitPeriodsUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.PERIODS_UPDATED, plan: event.result };
    }),
    emitError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.ERROR, error: event.error };
    }),
    emitPeriodOverlapError: emit(({ event }) => {
      assertEvent(event, Event.ON_PERIOD_OVERLAP_ERROR);
      return { type: Emit.PERIOD_OVERLAP_ERROR, message: event.message, overlappingCycleId: event.overlappingCycleId };
    }),
    emitPlanInvalidStateError: emit(({ event }) => {
      assertEvent(event, Event.ON_PLAN_INVALID_STATE_ERROR);
      return {
        type: Emit.PLAN_INVALID_STATE_ERROR,
        message: event.message,
        currentState: event.currentState,
        expectedState: event.expectedState,
      };
    }),
  },
  actors: {
    loadPlanActor: loadPlanLogic,
    updateNameActor: updateNameLogic,
    updateDescriptionActor: updateDescriptionLogic,
    updateStartDateActor: updateStartDateLogic,
    updatePeriodsActor: updatePeriodsLogic,
  },
}).createMachine({
  id: 'planEdit',
  context: getInitialContext(),
  initial: PlanEditState.Idle,
  states: {
    [PlanEditState.Idle]: {
      on: {
        [Event.LOAD]: PlanEditState.Loading,
      },
    },
    [PlanEditState.Loading]: {
      invoke: {
        id: 'loadPlanActor',
        src: 'loadPlanActor',
        input: ({ event }) => {
          assertEvent(event, Event.LOAD);
          return { planId: event.planId };
        },
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['setPlan', 'emitPlanLoaded'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['setError', 'emitError'],
          target: PlanEditState.Error,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['emitPlanInvalidStateError'],
          target: PlanEditState.Error,
        },
      },
    },
    [PlanEditState.Ready]: {
      on: {
        [Event.UPDATE_NAME]: PlanEditState.UpdatingName,
        [Event.UPDATE_DESCRIPTION]: PlanEditState.UpdatingDescription,
        [Event.UPDATE_START_DATE]: PlanEditState.UpdatingStartDate,
        [Event.UPDATE_PERIODS]: PlanEditState.UpdatingPeriods,
      },
    },
    [PlanEditState.UpdatingName]: {
      invoke: {
        id: 'updateNameActor',
        src: 'updateNameActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_NAME);
          return { planId: event.planId, name: event.name };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updatePlan', 'emitNameUpdated'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['emitPlanInvalidStateError'],
          target: PlanEditState.Ready,
        },
      },
    },
    [PlanEditState.UpdatingDescription]: {
      invoke: {
        id: 'updateDescriptionActor',
        src: 'updateDescriptionActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_DESCRIPTION);
          return { planId: event.planId, description: event.description };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updatePlan', 'emitDescriptionUpdated'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['emitPlanInvalidStateError'],
          target: PlanEditState.Ready,
        },
      },
    },
    [PlanEditState.UpdatingStartDate]: {
      invoke: {
        id: 'updateStartDateActor',
        src: 'updateStartDateActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_START_DATE);
          return { planId: event.planId, startDate: event.startDate };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updatePlan', 'emitStartDateUpdated'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['emitPeriodOverlapError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['emitPlanInvalidStateError'],
          target: PlanEditState.Ready,
        },
      },
    },
    [PlanEditState.UpdatingPeriods]: {
      invoke: {
        id: 'updatePeriodsActor',
        src: 'updatePeriodsActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_PERIODS);
          return { planId: event.planId, payload: event.payload };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updatePlan', 'emitPeriodsUpdated'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['emitPeriodOverlapError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['emitPlanInvalidStateError'],
          target: PlanEditState.Ready,
        },
      },
    },
    [PlanEditState.Error]: {
      on: {
        [Event.LOAD]: PlanEditState.Loading,
      },
    },
  },
});
