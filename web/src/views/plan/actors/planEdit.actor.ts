import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programGetLastCompletedCycle } from '@/views/cycle/services/cycle.service';
import {
  MAX_PLAN_TEMPLATES,
  matchSaveDecision,
  PlanTemplateDomainService,
  PlanTemplateValidationService,
} from '@/views/planTemplates/domain';
import {
  programCreateFromPlan,
  programListTemplates,
} from '@/views/planTemplates/services/plan-template.service';
import type { AdjacentCycle, PlanWithPeriodsResponse } from '@ketone/shared';
import { Effect, Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programGetPlan,
  programUpdatePlanMetadata,
  programUpdatePlanPeriods,
  type GetPlanError,
  type GetPlanSuccess,
  type UpdatePeriodsError,
  type UpdatePeriodsSuccess,
  type UpdatePlanMetadataError,
  type UpdatePlanMetadataSuccess,
} from '../services/plan.service';

// ============================================================================
// Sync Adapters — resolve Effect.Service instances for synchronous actor use
// ============================================================================

const validationSvc = Effect.runSync(
  PlanTemplateValidationService.pipe(Effect.provide(PlanTemplateValidationService.Default)),
);
const domainSvc = Effect.runSync(
  PlanTemplateDomainService.pipe(Effect.provide(PlanTemplateDomainService.Default)),
);

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
  SavingAsTemplate = 'SavingAsTemplate',
  Error = 'Error',
}

/**
 * Period update payload for timeline saves
 */
export type PeriodUpdateInput = {
  id?: string;
  fastingDuration: number;
  eatingWindow: number;
};

/**
 * Plan Edit Actor Events
 */
export enum Event {
  LOAD = 'LOAD',
  UPDATE_NAME = 'UPDATE_NAME',
  UPDATE_DESCRIPTION = 'UPDATE_DESCRIPTION',
  UPDATE_START_DATE = 'UPDATE_START_DATE',
  UPDATE_PERIODS = 'UPDATE_PERIODS',
  // Combined save that handles startDate + periods sequencing
  SAVE_TIMELINE = 'SAVE_TIMELINE',
  // Save current plan as a reusable template
  SAVE_AS_TEMPLATE = 'SAVE_AS_TEMPLATE',
  // Callback events
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_ERROR = 'ON_ERROR',
  ON_PERIOD_OVERLAP_ERROR = 'ON_PERIOD_OVERLAP_ERROR',
  ON_PLAN_INVALID_STATE_ERROR = 'ON_PLAN_INVALID_STATE_ERROR',
  ON_TEMPLATE_SAVED = 'ON_TEMPLATE_SAVED',
  ON_TEMPLATE_LIMIT_REACHED = 'ON_TEMPLATE_LIMIT_REACHED',
}

type UpdateType = 'name' | 'description' | 'startDate' | 'periods';

type EventType =
  | { type: Event.LOAD; planId: string }
  | { type: Event.UPDATE_NAME; planId: string; name: string }
  | { type: Event.UPDATE_DESCRIPTION; planId: string; description: string }
  | { type: Event.UPDATE_START_DATE; planId: string; startDate: Date }
  | { type: Event.UPDATE_PERIODS; planId: string; periods: PeriodUpdateInput[] }
  | {
      type: Event.SAVE_TIMELINE;
      planId: string;
      startDate?: Date;
      periods?: PeriodUpdateInput[];
    }
  | { type: Event.SAVE_AS_TEMPLATE; planId: string }
  | { type: Event.ON_LOAD_SUCCESS; result: GetPlanSuccess; lastCompletedCycle: AdjacentCycle | null }
  | { type: Event.ON_UPDATE_SUCCESS; result: UpdatePlanMetadataSuccess | UpdatePeriodsSuccess; updateType: UpdateType }
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
  | { type: Emit.PLAN_LOADED; plan: PlanWithPeriodsResponse }
  | { type: Emit.NAME_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.DESCRIPTION_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.START_DATE_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.PERIODS_UPDATED; plan: PlanWithPeriodsResponse }
  | { type: Emit.TIMELINE_SAVED; plan: PlanWithPeriodsResponse }
  | { type: Emit.ERROR; error: string }
  | { type: Emit.PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string }
  | { type: Emit.PLAN_INVALID_STATE_ERROR; message: string; currentState: string; expectedState: string }
  | { type: Emit.TEMPLATE_SAVED }
  | { type: Emit.TEMPLATE_SAVE_ERROR; error: string }
  | { type: Emit.TEMPLATE_LIMIT_REACHED; message: string };

type Context = {
  plan: PlanWithPeriodsResponse | null;
  lastCompletedCycle: AdjacentCycle | null;
  error: string | null;
  // Pending period updates to apply after startDate update completes
  pendingPeriodUpdates: PeriodUpdateInput[] | null;
};

function getInitialContext(): Context {
  return {
    plan: null,
    lastCompletedCycle: null,
    error: null,
    pendingPeriodUpdates: null,
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

const updateNameLogic = fromCallback<EventObject, { planId: string; name: string }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.planId, { name: input.name }),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'name' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

const updateDescriptionLogic = fromCallback<EventObject, { planId: string; description: string }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePlanMetadata(input.planId, { description: input.description }),
      (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'description' }),
      (error) => sendBack(handleUpdateError(error)),
    ),
);

const updateStartDateLogic = fromCallback<EventObject, { planId: string; startDate: Date }>(({ sendBack, input }) =>
  runWithUi(
    programUpdatePlanMetadata(input.planId, { startDate: input.startDate }),
    (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'startDate' }),
    (error) => sendBack(handleUpdateError(error)),
  ),
);

const updatePeriodsLogic = fromCallback<EventObject, { planId: string; periods: PeriodUpdateInput[] }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePlanPeriods(input.planId, { periods: input.periods }),
      (result) => sendBack({ type: Event.ON_UPDATE_SUCCESS, result, updateType: 'periods' }),
      (error) => sendBack(handleUpdateError(error)),
    ),
);

const saveAsTemplateLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) => {
  // Load templates to check limit via contract decision ADT, then create if under limit
  runWithUi(
    programListTemplates(),
    (templates) => {
      const decision = validationSvc.decideSaveTemplateLimit({
        currentCount: templates.length,
        maxTemplates: MAX_PLAN_TEMPLATES,
      });
      matchSaveDecision(decision, {
        CanSave: () => {
          runWithUi(
            programCreateFromPlan(input.planId),
            () => sendBack({ type: Event.ON_TEMPLATE_SAVED }),
            (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
          );
        },
        LimitReached: () => {
          sendBack({ type: Event.ON_TEMPLATE_LIMIT_REACHED });
        },
      });
    },
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  );
});

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
    // Store pending periods for after startDate update
    setPendingPeriods: assign(({ event }) => {
      assertEvent(event, Event.SAVE_TIMELINE);
      return { pendingPeriodUpdates: event.periods ?? null };
    }),
    clearPendingPeriods: assign(() => ({ pendingPeriodUpdates: null })),
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
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
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
    emitTemplateLimitReached: emit(() => ({
      type: Emit.TEMPLATE_LIMIT_REACHED,
      message: domainSvc.formatLimitReachedMessage(MAX_PLAN_TEMPLATES),
    })),
  },
  actors: {
    loadPlanActor: loadPlanLogic,
    updateNameActor: updateNameLogic,
    updateDescriptionActor: updateDescriptionLogic,
    updateStartDateActor: updateStartDateLogic,
    updatePeriodsActor: updatePeriodsLogic,
    saveAsTemplateActor: saveAsTemplateLogic,
  },
  guards: {
    hasPendingPeriods: ({ context }) => context.pendingPeriodUpdates !== null,
    hasStartDateChange: ({ event }) => {
      assertEvent(event, Event.SAVE_TIMELINE);
      return event.startDate !== undefined;
    },
    hasOnlyPeriodChanges: ({ event }) => {
      assertEvent(event, Event.SAVE_TIMELINE);
      return event.startDate === undefined && event.periods !== undefined;
    },
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
        [Event.SAVE_AS_TEMPLATE]: PlanEditState.SavingAsTemplate,
        [Event.SAVE_TIMELINE]: [
          {
            // If startDate changed, update it first (store pending periods)
            guard: 'hasStartDateChange',
            actions: ['setPendingPeriods'],
            target: PlanEditState.UpdatingStartDate,
          },
          {
            // If only periods changed, store them as pending and update directly
            // This ensures emitTimelineSaved is used instead of emitPeriodsUpdated
            guard: 'hasOnlyPeriodChanges',
            actions: ['setPendingPeriods'],
            target: PlanEditState.UpdatingPeriods,
          },
        ],
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
          // Both UPDATE_START_DATE and SAVE_TIMELINE can trigger this state
          // For SAVE_TIMELINE, the hasStartDateChange guard ensures startDate is defined
          assertEvent(event, [Event.UPDATE_START_DATE, Event.SAVE_TIMELINE]);
          return { planId: event.planId, startDate: event.startDate! };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: [
          {
            // If we have pending periods, continue to update them
            guard: 'hasPendingPeriods',
            actions: ['updatePlan', 'emitStartDateUpdated'],
            target: PlanEditState.UpdatingPeriods,
          },
          {
            // No pending periods, we're done
            actions: ['updatePlan', 'emitStartDateUpdated'],
            target: PlanEditState.Ready,
          },
        ],
        [Event.ON_ERROR]: {
          actions: ['clearPendingPeriods', 'emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['clearPendingPeriods', 'emitPeriodOverlapError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['clearPendingPeriods', 'emitPlanInvalidStateError'],
          target: PlanEditState.Ready,
        },
      },
    },
    [PlanEditState.UpdatingPeriods]: {
      invoke: {
        id: 'updatePeriodsActor',
        src: 'updatePeriodsActor',
        input: ({ context, event }) => {
          // Use pending periods if available (from SAVE_TIMELINE flow after startDate update)
          if (context.pendingPeriodUpdates) {
            return {
              planId: context.plan!.id,
              periods: context.pendingPeriodUpdates,
            };
          }

          // Handle SAVE_TIMELINE (only periods) or UPDATE_PERIODS
          // For SAVE_TIMELINE, the hasOnlyPeriodChanges guard ensures periods is defined
          assertEvent(event, [Event.SAVE_TIMELINE, Event.UPDATE_PERIODS]);
          return { planId: event.planId, periods: event.periods! };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: [
          {
            // Coming from SAVE_TIMELINE flow (had pending periods)
            guard: 'hasPendingPeriods',
            actions: ['updatePlan', 'clearPendingPeriods', 'emitTimelineSaved'],
            target: PlanEditState.Ready,
          },
          {
            // Direct period update
            actions: ['updatePlan', 'emitPeriodsUpdated'],
            target: PlanEditState.Ready,
          },
        ],
        [Event.ON_ERROR]: {
          actions: ['clearPendingPeriods', 'emitError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['clearPendingPeriods', 'emitPeriodOverlapError'],
          target: PlanEditState.Ready,
        },
        [Event.ON_PLAN_INVALID_STATE_ERROR]: {
          actions: ['clearPendingPeriods', 'emitPlanInvalidStateError'],
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
