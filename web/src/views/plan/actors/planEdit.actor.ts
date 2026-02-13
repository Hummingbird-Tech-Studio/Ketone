import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programGetLastCompletedCycle } from '@/views/cycle/services/cycle.service';
import type { SaveTimelineDomainInput, UpdateMetadataDomainInput, UpdatePeriodsInput } from '@/views/plan/domain';
import { saveAsTemplateLogic } from '@/views/planTemplates/actors/saveAsTemplate.logic';
import type { AdjacentCycle } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import type { PlanDetail, PlanId } from '../domain';
import type { GetPlanError, UpdateMetadataError, UpdatePeriodsError } from '../services/plan-api-client.service';
import {
  programGetPlan,
  programSaveTimeline,
  programUpdatePlanMetadata,
  programUpdatePlanPeriods,
} from '../services/plan-application.service';

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
  SavingTimeline = 'SavingTimeline',
  SavingAsTemplate = 'SavingAsTemplate',
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
  // Combined save that handles startDate + periods via FC decision
  SAVE_TIMELINE = 'SAVE_TIMELINE',
  // Save current plan as a reusable template
  SAVE_AS_TEMPLATE = 'SAVE_AS_TEMPLATE',
  // Callback events
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_SAVE_TIMELINE_SUCCESS = 'ON_SAVE_TIMELINE_SUCCESS',
  ON_NO_CHANGES = 'ON_NO_CHANGES',
  ON_ERROR = 'ON_ERROR',
  ON_PERIOD_OVERLAP_ERROR = 'ON_PERIOD_OVERLAP_ERROR',
  ON_PLAN_INVALID_STATE_ERROR = 'ON_PLAN_INVALID_STATE_ERROR',
  ON_TEMPLATE_SAVED = 'ON_TEMPLATE_SAVED',
  ON_TEMPLATE_LIMIT_REACHED = 'ON_TEMPLATE_LIMIT_REACHED',
}

type UpdateType = 'name' | 'description' | 'startDate' | 'periods';

type EventType =
  | { type: Event.LOAD; planId: PlanId }
  | { type: Event.UPDATE_NAME; input: UpdateMetadataDomainInput }
  | { type: Event.UPDATE_DESCRIPTION; input: UpdateMetadataDomainInput }
  | { type: Event.UPDATE_START_DATE; input: UpdateMetadataDomainInput }
  | { type: Event.UPDATE_PERIODS; input: UpdatePeriodsInput }
  | { type: Event.SAVE_TIMELINE; input: SaveTimelineDomainInput }
  | { type: Event.SAVE_AS_TEMPLATE; planId: PlanId }
  | { type: Event.ON_LOAD_SUCCESS; result: PlanDetail; lastCompletedCycle: AdjacentCycle | null }
  | { type: Event.ON_UPDATE_SUCCESS; result: PlanDetail; updateType: UpdateType }
  | { type: Event.ON_SAVE_TIMELINE_SUCCESS; result: PlanDetail }
  | { type: Event.ON_NO_CHANGES }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string }
  | { type: Event.ON_PLAN_INVALID_STATE_ERROR; message: string; currentState: string; expectedState: string }
  | { type: Event.ON_TEMPLATE_SAVED }
  | { type: Event.ON_TEMPLATE_LIMIT_REACHED };

/**
 * Plan Edit Actor Emits
 */
export enum Emit {
  PLAN_LOADED = 'PLAN_LOADED',
  NAME_UPDATED = 'NAME_UPDATED',
  DESCRIPTION_UPDATED = 'DESCRIPTION_UPDATED',
  START_DATE_UPDATED = 'START_DATE_UPDATED',
  PERIODS_UPDATED = 'PERIODS_UPDATED',
  TIMELINE_SAVED = 'TIMELINE_SAVED',
  ERROR = 'ERROR',
  PERIOD_OVERLAP_ERROR = 'PERIOD_OVERLAP_ERROR',
  PLAN_INVALID_STATE_ERROR = 'PLAN_INVALID_STATE_ERROR',
  TEMPLATE_SAVED = 'TEMPLATE_SAVED',
  TEMPLATE_SAVE_ERROR = 'TEMPLATE_SAVE_ERROR',
  TEMPLATE_LIMIT_REACHED = 'TEMPLATE_LIMIT_REACHED',
}

export type EmitType =
  | { type: Emit.PLAN_LOADED; plan: PlanDetail }
  | { type: Emit.NAME_UPDATED; plan: PlanDetail }
  | { type: Emit.DESCRIPTION_UPDATED; plan: PlanDetail }
  | { type: Emit.START_DATE_UPDATED; plan: PlanDetail }
  | { type: Emit.PERIODS_UPDATED; plan: PlanDetail }
  | { type: Emit.TIMELINE_SAVED; plan: PlanDetail }
  | { type: Emit.ERROR; error: string }
  | { type: Emit.PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string }
  | { type: Emit.PLAN_INVALID_STATE_ERROR; message: string; currentState: string; expectedState: string }
  | { type: Emit.TEMPLATE_SAVED }
  | { type: Emit.TEMPLATE_SAVE_ERROR; error: string }
  | { type: Emit.TEMPLATE_LIMIT_REACHED };

type Context = {
  plan: PlanDetail | null;
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
 * Handles errors from plan update operations.
 * HTTP/infrastructure errors fall through to the catch-all with extractErrorMessage.
 */
function handleUpdateError(error: UpdateMetadataError | UpdatePeriodsError | GetPlanError) {
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
    // Domain errors without dedicated events
    Match.when({ _tag: 'PeriodsMismatchError' }, (err) => ({
      type: Event.ON_ERROR,
      error: err.message,
    })),
    Match.when({ _tag: 'PeriodNotInPlanError' }, (err) => ({
      type: Event.ON_ERROR,
      error: err.message,
    })),
    // Infrastructure errors (HTTP, auth, body)
    Match.orElse((err) => ({
      type: Event.ON_ERROR,
      error: extractErrorMessage(err),
    })),
  );
}

// ============================================================================
// fromCallback Actors — call application service programs (single entrypoint)
// ============================================================================

// Load plan logic - loads both plan and last completed cycle in parallel
const loadPlanLogic = fromCallback<EventObject, { planId: PlanId }>(({ sendBack, input }) => {
  let plan: PlanDetail | null = null;
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

const updateNameLogic = fromCallback<EventObject, { input: UpdateMetadataDomainInput }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.input),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'name' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

const updateDescriptionLogic = fromCallback<EventObject, { input: UpdateMetadataDomainInput }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.input),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'description' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

const updateStartDateLogic = fromCallback<EventObject, { input: UpdateMetadataDomainInput }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.input),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'startDate' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

const updatePeriodsLogic = fromCallback<EventObject, { input: UpdatePeriodsInput }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanPeriods(input.input),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'periods' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

/**
 * SaveTimeline logic — delegates to application service which uses FC decision ADT.
 * Application service handles the Three Phases: decision → metadata update → period update.
 * Returns PlanDetail | null (null = no changes).
 */
const saveTimelineLogic = fromCallback<EventObject, { input: SaveTimelineDomainInput }>(({ sendBack, input }) =>
  runWithUi(
    programSaveTimeline(input.input),
    (result) => {
      if (result === null) {
        sendBack({ type: Event.ON_NO_CHANGES });
      } else {
        sendBack({ type: Event.ON_SAVE_TIMELINE_SUCCESS, result });
      }
    },
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
    updatePlanFromTimeline: assign(({ event }) => {
      assertEvent(event, Event.ON_SAVE_TIMELINE_SUCCESS);
      return { plan: event.result, error: null };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { error: event.error };
    }),
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
    emitTimelineSaved: emit(({ event }) => {
      assertEvent(event, Event.ON_SAVE_TIMELINE_SUCCESS);
      return { type: Emit.TIMELINE_SAVED, plan: event.result };
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
    emitTemplateSaved: emit(() => ({ type: Emit.TEMPLATE_SAVED })),
    emitTemplateSaveError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.TEMPLATE_SAVE_ERROR, error: event.error };
    }),
    emitTemplateLimitReached: emit(() => ({ type: Emit.TEMPLATE_LIMIT_REACHED })),
  },
  actors: {
    loadPlanActor: loadPlanLogic,
    updateNameActor: updateNameLogic,
    updateDescriptionActor: updateDescriptionLogic,
    updateStartDateActor: updateStartDateLogic,
    updatePeriodsActor: updatePeriodsLogic,
    saveTimelineActor: saveTimelineLogic,
    saveAsTemplateActor: saveAsTemplateLogic,
  },
  guards: {},
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
        [Event.SAVE_TIMELINE]: PlanEditState.SavingTimeline,
        [Event.SAVE_AS_TEMPLATE]: PlanEditState.SavingAsTemplate,
      },
    },
    [PlanEditState.UpdatingName]: {
      invoke: {
        id: 'updateNameActor',
        src: 'updateNameActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_NAME);
          return { input: event.input };
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
          return { input: event.input };
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
          return { input: event.input };
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
          return { input: event.input };
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
    [PlanEditState.SavingTimeline]: {
      invoke: {
        id: 'saveTimelineActor',
        src: 'saveTimelineActor',
        input: ({ event }) => {
          assertEvent(event, Event.SAVE_TIMELINE);
          return { input: event.input };
        },
      },
      on: {
        [Event.ON_SAVE_TIMELINE_SUCCESS]: {
          actions: ['updatePlanFromTimeline', 'emitTimelineSaved'],
          target: PlanEditState.Ready,
        },
        [Event.ON_NO_CHANGES]: {
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
    [PlanEditState.SavingAsTemplate]: {
      invoke: {
        id: 'saveAsTemplateActor',
        src: 'saveAsTemplateActor',
        input: ({ event }) => {
          assertEvent(event, Event.SAVE_AS_TEMPLATE);
          return { planId: event.planId };
        },
      },
      on: {
        [Event.ON_TEMPLATE_SAVED]: {
          actions: ['emitTemplateSaved'],
          target: PlanEditState.Ready,
        },
        [Event.ON_TEMPLATE_LIMIT_REACHED]: {
          actions: ['emitTemplateLimitReached'],
          target: PlanEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitTemplateSaveError'],
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
