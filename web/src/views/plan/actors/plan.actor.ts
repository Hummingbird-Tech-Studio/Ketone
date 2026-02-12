import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programGetLastCompletedCycle } from '@/views/cycle/services/cycle.service';
import { programSaveAsTemplate } from '@/views/planTemplates/services/plan-template-application.service';
import type { AdjacentCycle } from '@ketone/shared';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programCancelPlan,
  programCreatePlan,
  programGetActivePlan,
  programGetPlan,
  programListPlans,
  programUpdatePlanPeriods,
  type CancelPlanError,
  type CancelPlanSuccess,
  type CreatePlanError,
  type CreatePlanPayload,
  type GetActivePlanError,
  type GetActivePlanSuccess,
  type GetPlanSuccess,
  type ListPlansSuccess,
  type UpdatePeriodsError,
  type UpdatePeriodsPayload,
  type UpdatePeriodsSuccess,
} from '../services/plan.service';

/**
 * Plan Actor States
 */
export enum PlanState {
  Idle = 'Idle',
  LoadingActivePlan = 'LoadingActivePlan',
  LoadingPlan = 'LoadingPlan',
  LoadingPlans = 'LoadingPlans',
  LoadingLastCompletedCycle = 'LoadingLastCompletedCycle',
  Creating = 'Creating',
  Cancelling = 'Cancelling',
  UpdatingPeriods = 'UpdatingPeriods',
  SavingAsTemplate = 'SavingAsTemplate',
  HasActivePlan = 'HasActivePlan',
  NoPlan = 'NoPlan',
}

/**
 * Plan Actor Events
 */
export enum Event {
  LOAD_ACTIVE_PLAN = 'LOAD_ACTIVE_PLAN',
  LOAD_PLAN = 'LOAD_PLAN',
  LOAD_PLANS = 'LOAD_PLANS',
  LOAD_LAST_COMPLETED_CYCLE = 'LOAD_LAST_COMPLETED_CYCLE',
  CREATE = 'CREATE',
  CANCEL = 'CANCEL',
  UPDATE_PERIODS = 'UPDATE_PERIODS',
  REFRESH = 'REFRESH',
  // Callback events
  ON_ACTIVE_PLAN_LOADED = 'ON_ACTIVE_PLAN_LOADED',
  ON_PLAN_LOADED = 'ON_PLAN_LOADED',
  ON_PLANS_LOADED = 'ON_PLANS_LOADED',
  ON_LAST_COMPLETED_CYCLE_LOADED = 'ON_LAST_COMPLETED_CYCLE_LOADED',
  ON_NO_ACTIVE_PLAN = 'ON_NO_ACTIVE_PLAN',
  ON_CREATED = 'ON_CREATED',
  ON_CANCELLED = 'ON_CANCELLED',
  ON_PERIODS_UPDATED = 'ON_PERIODS_UPDATED',
  SAVE_AS_TEMPLATE = 'SAVE_AS_TEMPLATE',
  ON_TEMPLATE_SAVED = 'ON_TEMPLATE_SAVED',
  ON_TEMPLATE_LIMIT_REACHED = 'ON_TEMPLATE_LIMIT_REACHED',
  ON_ERROR = 'ON_ERROR',
  ON_ALREADY_ACTIVE_ERROR = 'ON_ALREADY_ACTIVE_ERROR',
  ON_ACTIVE_CYCLE_EXISTS_ERROR = 'ON_ACTIVE_CYCLE_EXISTS_ERROR',
  ON_INVALID_PERIOD_COUNT_ERROR = 'ON_INVALID_PERIOD_COUNT_ERROR',
  ON_PERIOD_OVERLAP_ERROR = 'ON_PERIOD_OVERLAP_ERROR',
}

type EventType =
  | { type: Event.LOAD_ACTIVE_PLAN }
  | { type: Event.LOAD_PLAN; planId: string }
  | { type: Event.LOAD_PLANS }
  | { type: Event.LOAD_LAST_COMPLETED_CYCLE }
  | { type: Event.CREATE; payload: CreatePlanPayload }
  | { type: Event.CANCEL; planId: string }
  | { type: Event.UPDATE_PERIODS; planId: string; payload: UpdatePeriodsPayload }
  | { type: Event.REFRESH }
  | { type: Event.ON_ACTIVE_PLAN_LOADED; result: GetActivePlanSuccess }
  | { type: Event.ON_PLAN_LOADED; result: GetPlanSuccess }
  | { type: Event.ON_PLANS_LOADED; result: ListPlansSuccess }
  | { type: Event.ON_LAST_COMPLETED_CYCLE_LOADED; result: AdjacentCycle | null }
  | { type: Event.ON_NO_ACTIVE_PLAN }
  | { type: Event.ON_CREATED; result: GetActivePlanSuccess }
  | { type: Event.ON_CANCELLED; result: CancelPlanSuccess }
  | { type: Event.ON_PERIODS_UPDATED; result: UpdatePeriodsSuccess }
  | { type: Event.SAVE_AS_TEMPLATE; planId: string }
  | { type: Event.ON_TEMPLATE_SAVED }
  | { type: Event.ON_TEMPLATE_LIMIT_REACHED }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_ALREADY_ACTIVE_ERROR; message: string; userId?: string }
  | { type: Event.ON_ACTIVE_CYCLE_EXISTS_ERROR; message: string; userId?: string }
  | {
      type: Event.ON_INVALID_PERIOD_COUNT_ERROR;
      message: string;
      periodCount: number;
      minPeriods: number;
      maxPeriods: number;
    }
  | { type: Event.ON_PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string };

/**
 * Plan Actor Emits
 */
export enum Emit {
  PLAN_LOADED = 'PLAN_LOADED',
  PLAN_CREATED = 'PLAN_CREATED',
  PLAN_CANCELLED = 'PLAN_CANCELLED',
  PERIODS_UPDATED = 'PERIODS_UPDATED',
  TEMPLATE_SAVED = 'TEMPLATE_SAVED',
  TEMPLATE_SAVE_ERROR = 'TEMPLATE_SAVE_ERROR',
  TEMPLATE_LIMIT_REACHED = 'TEMPLATE_LIMIT_REACHED',
  PLAN_ERROR = 'PLAN_ERROR',
  ALREADY_ACTIVE_ERROR = 'ALREADY_ACTIVE_ERROR',
  ACTIVE_CYCLE_EXISTS_ERROR = 'ACTIVE_CYCLE_EXISTS_ERROR',
  INVALID_PERIOD_COUNT_ERROR = 'INVALID_PERIOD_COUNT_ERROR',
  PERIOD_OVERLAP_ERROR = 'PERIOD_OVERLAP_ERROR',
}

export type EmitType =
  | { type: Emit.PLAN_LOADED; plan: GetActivePlanSuccess }
  | { type: Emit.PLAN_CREATED; plan: GetActivePlanSuccess }
  | { type: Emit.PLAN_CANCELLED; plan: CancelPlanSuccess }
  | { type: Emit.PERIODS_UPDATED; plan: UpdatePeriodsSuccess }
  | { type: Emit.TEMPLATE_SAVED }
  | { type: Emit.TEMPLATE_SAVE_ERROR; error: string }
  | { type: Emit.TEMPLATE_LIMIT_REACHED }
  | { type: Emit.PLAN_ERROR; error: string }
  | { type: Emit.ALREADY_ACTIVE_ERROR; message: string }
  | { type: Emit.ACTIVE_CYCLE_EXISTS_ERROR; message: string }
  | { type: Emit.INVALID_PERIOD_COUNT_ERROR; message: string; periodCount: number }
  | { type: Emit.PERIOD_OVERLAP_ERROR; message: string; overlappingCycleId: string };

type PlanWithPeriods = GetActivePlanSuccess;
type PlanSummary = ListPlansSuccess[number];

type Context = {
  activePlan: PlanWithPeriods | null;
  selectedPlan: PlanWithPeriods | null;
  plans: PlanSummary[];
  lastCompletedCycle: AdjacentCycle | null;
};

function getInitialContext(): Context {
  return {
    activePlan: null,
    selectedPlan: null,
    plans: [],
    lastCompletedCycle: null,
  };
}

/**
 * Handles errors from plan operations, detecting specific error types
 */
function handlePlanError(error: CreatePlanError | CancelPlanError | GetActivePlanError | UpdatePeriodsError) {
  return Match.value(error).pipe(
    Match.when({ _tag: 'NoActivePlanError' }, () => ({
      type: Event.ON_NO_ACTIVE_PLAN,
    })),
    Match.when({ _tag: 'PlanAlreadyActiveError' }, (err) => ({
      type: Event.ON_ALREADY_ACTIVE_ERROR,
      message: err.message,
      userId: err.userId,
    })),
    Match.when({ _tag: 'ActiveCycleExistsError' }, (err) => ({
      type: Event.ON_ACTIVE_CYCLE_EXISTS_ERROR,
      message: err.message,
      userId: err.userId,
    })),
    Match.when({ _tag: 'InvalidPeriodCountError' }, (err) => ({
      type: Event.ON_INVALID_PERIOD_COUNT_ERROR,
      message: err.message,
      periodCount: err.periodCount,
      minPeriods: err.minPeriods,
      maxPeriods: err.maxPeriods,
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

// Load active plan logic
const loadActivePlanLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    programGetActivePlan(),
    (result) => sendBack({ type: Event.ON_ACTIVE_PLAN_LOADED, result }),
    (error) => sendBack(handlePlanError(error)),
  ),
);

// Load specific plan logic
const loadPlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programGetPlan(input.planId),
    (result) => sendBack({ type: Event.ON_PLAN_LOADED, result }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// Load all plans logic
const loadPlansLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    programListPlans(),
    (result) => sendBack({ type: Event.ON_PLANS_LOADED, result }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// Load last completed cycle logic
const loadLastCompletedCycleLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    programGetLastCompletedCycle(),
    (result) => sendBack({ type: Event.ON_LAST_COMPLETED_CYCLE_LOADED, result }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// Create plan logic
const createPlanLogic = fromCallback<EventObject, { payload: CreatePlanPayload }>(({ sendBack, input }) =>
  runWithUi(
    programCreatePlan(input.payload),
    (result) => sendBack({ type: Event.ON_CREATED, result }),
    (error) => sendBack(handlePlanError(error)),
  ),
);

// Cancel plan logic
const cancelPlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programCancelPlan(input.planId),
    (result) => sendBack({ type: Event.ON_CANCELLED, result }),
    (error) => sendBack(handlePlanError(error)),
  ),
);

// Update plan periods logic
const updatePeriodsLogic = fromCallback<EventObject, { planId: string; payload: UpdatePeriodsPayload }>(
  ({ sendBack, input }) =>
    runWithUi(
      programUpdatePlanPeriods(input.planId, input.payload),
      (result) => sendBack({ type: Event.ON_PERIODS_UPDATED, result }),
      (error) => sendBack(handlePlanError(error)),
    ),
);

// Save plan as template logic
const saveAsTemplateLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programSaveAsTemplate(input.planId),
    () => sendBack({ type: Event.ON_TEMPLATE_SAVED }),
    (error) =>
      sendBack(
        Match.value(error).pipe(
          Match.when({ _tag: 'TemplateLimitReachedError' }, () => ({
            type: Event.ON_TEMPLATE_LIMIT_REACHED,
          })),
          Match.orElse((err) => ({
            type: Event.ON_ERROR,
            error: extractErrorMessage(err),
          })),
        ),
      ),
  ),
);

export const planMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setActivePlan: assign(({ event }) => {
      assertEvent(event, Event.ON_ACTIVE_PLAN_LOADED);
      return { activePlan: event.result };
    }),
    setSelectedPlan: assign(({ event }) => {
      assertEvent(event, Event.ON_PLAN_LOADED);
      return { selectedPlan: event.result };
    }),
    setPlans: assign(({ event }) => {
      assertEvent(event, Event.ON_PLANS_LOADED);
      return { plans: [...event.result] };
    }),
    setCreatedPlan: assign(({ event }) => {
      assertEvent(event, Event.ON_CREATED);
      return { activePlan: event.result };
    }),
    updateCancelledPlan: assign(({ context, event }) => {
      assertEvent(event, Event.ON_CANCELLED);
      return {
        activePlan: null,
        plans: context.plans.map((p) => (p.id === event.result.id ? { ...p, status: event.result.status } : p)),
        selectedPlan:
          context.selectedPlan?.id === event.result.id
            ? { ...context.selectedPlan, status: event.result.status }
            : context.selectedPlan,
      };
    }),
    setUpdatedPlan: assign(({ context, event }) => {
      assertEvent(event, Event.ON_PERIODS_UPDATED);
      return {
        activePlan: context.activePlan?.id === event.result.id ? event.result : context.activePlan,
        selectedPlan: context.selectedPlan?.id === event.result.id ? event.result : context.selectedPlan,
      };
    }),
    setLastCompletedCycle: assign(({ event }) => {
      assertEvent(event, Event.ON_LAST_COMPLETED_CYCLE_LOADED);
      return { lastCompletedCycle: event.result };
    }),
    clearActivePlan: assign(() => ({ activePlan: null })),
    resetContext: assign(() => getInitialContext()),
    // Emit actions
    emitPlanLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_ACTIVE_PLAN_LOADED);
      return { type: Emit.PLAN_LOADED, plan: event.result };
    }),
    emitPlanCreated: emit(({ event }) => {
      assertEvent(event, Event.ON_CREATED);
      return { type: Emit.PLAN_CREATED, plan: event.result };
    }),
    emitPlanCancelled: emit(({ event }) => {
      assertEvent(event, Event.ON_CANCELLED);
      return { type: Emit.PLAN_CANCELLED, plan: event.result };
    }),
    emitPlanError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.PLAN_ERROR, error: event.error };
    }),
    emitAlreadyActiveError: emit(({ event }) => {
      assertEvent(event, Event.ON_ALREADY_ACTIVE_ERROR);
      return { type: Emit.ALREADY_ACTIVE_ERROR, message: event.message };
    }),
    emitActiveCycleExistsError: emit(({ event }) => {
      assertEvent(event, Event.ON_ACTIVE_CYCLE_EXISTS_ERROR);
      return { type: Emit.ACTIVE_CYCLE_EXISTS_ERROR, message: event.message };
    }),
    emitInvalidPeriodCountError: emit(({ event }) => {
      assertEvent(event, Event.ON_INVALID_PERIOD_COUNT_ERROR);
      return { type: Emit.INVALID_PERIOD_COUNT_ERROR, message: event.message, periodCount: event.periodCount };
    }),
    emitPeriodsUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_PERIODS_UPDATED);
      return { type: Emit.PERIODS_UPDATED, plan: event.result };
    }),
    emitPeriodOverlapError: emit(({ event }) => {
      assertEvent(event, Event.ON_PERIOD_OVERLAP_ERROR);
      return { type: Emit.PERIOD_OVERLAP_ERROR, message: event.message, overlappingCycleId: event.overlappingCycleId };
    }),
    emitTemplateSaved: emit({ type: Emit.TEMPLATE_SAVED }),
    emitTemplateSaveError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.TEMPLATE_SAVE_ERROR, error: event.error };
    }),
    emitTemplateLimitReached: emit({ type: Emit.TEMPLATE_LIMIT_REACHED }),
  },
  actors: {
    loadActivePlanActor: loadActivePlanLogic,
    loadPlanActor: loadPlanLogic,
    loadPlansActor: loadPlansLogic,
    loadLastCompletedCycleActor: loadLastCompletedCycleLogic,
    createPlanActor: createPlanLogic,
    cancelPlanActor: cancelPlanLogic,
    updatePeriodsActor: updatePeriodsLogic,
    saveAsTemplateActor: saveAsTemplateLogic,
  },
  guards: {
    hasActivePlanInContext: ({ context }) => context.activePlan !== null,
  },
}).createMachine({
  id: 'plan',
  context: getInitialContext(),
  initial: PlanState.Idle,
  on: {
    [Event.REFRESH]: {
      actions: ['resetContext'],
      target: `.${PlanState.LoadingActivePlan}`,
    },
  },
  states: {
    [PlanState.Idle]: {
      on: {
        [Event.LOAD_ACTIVE_PLAN]: PlanState.LoadingActivePlan,
        [Event.LOAD_PLAN]: PlanState.LoadingPlan,
        [Event.LOAD_PLANS]: PlanState.LoadingPlans,
        [Event.LOAD_LAST_COMPLETED_CYCLE]: PlanState.LoadingLastCompletedCycle,
        [Event.CREATE]: PlanState.Creating,
      },
    },
    [PlanState.LoadingActivePlan]: {
      invoke: {
        id: 'loadActivePlanActor',
        src: 'loadActivePlanActor',
      },
      on: {
        [Event.ON_ACTIVE_PLAN_LOADED]: {
          actions: ['setActivePlan', 'emitPlanLoaded'],
          target: PlanState.HasActivePlan,
        },
        [Event.ON_NO_ACTIVE_PLAN]: {
          actions: ['clearActivePlan'],
          target: PlanState.NoPlan,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: PlanState.Idle,
        },
      },
    },
    [PlanState.LoadingPlan]: {
      invoke: {
        id: 'loadPlanActor',
        src: 'loadPlanActor',
        input: ({ event }) => {
          assertEvent(event, Event.LOAD_PLAN);
          return { planId: event.planId };
        },
      },
      on: {
        [Event.ON_PLAN_LOADED]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['setSelectedPlan'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['setSelectedPlan'],
            target: PlanState.NoPlan,
          },
        ],
        [Event.ON_ERROR]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['emitPlanError'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['emitPlanError'],
            target: PlanState.NoPlan,
          },
        ],
      },
    },
    [PlanState.LoadingPlans]: {
      invoke: {
        id: 'loadPlansActor',
        src: 'loadPlansActor',
      },
      on: {
        [Event.ON_PLANS_LOADED]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['setPlans'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['setPlans'],
            target: PlanState.NoPlan,
          },
        ],
        [Event.ON_ERROR]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['emitPlanError'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['emitPlanError'],
            target: PlanState.NoPlan,
          },
        ],
      },
    },
    [PlanState.LoadingLastCompletedCycle]: {
      invoke: {
        id: 'loadLastCompletedCycleActor',
        src: 'loadLastCompletedCycleActor',
      },
      on: {
        [Event.ON_LAST_COMPLETED_CYCLE_LOADED]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['setLastCompletedCycle'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['setLastCompletedCycle'],
            target: PlanState.NoPlan,
          },
        ],
        [Event.ON_ERROR]: [
          {
            guard: 'hasActivePlanInContext',
            actions: ['emitPlanError'],
            target: PlanState.HasActivePlan,
          },
          {
            actions: ['emitPlanError'],
            target: PlanState.NoPlan,
          },
        ],
      },
    },
    [PlanState.Creating]: {
      invoke: {
        id: 'createPlanActor',
        src: 'createPlanActor',
        input: ({ event }) => {
          assertEvent(event, Event.CREATE);
          return { payload: event.payload };
        },
      },
      on: {
        [Event.ON_CREATED]: {
          actions: ['setCreatedPlan', 'emitPlanCreated'],
          target: PlanState.HasActivePlan,
        },
        [Event.ON_ALREADY_ACTIVE_ERROR]: {
          actions: ['emitAlreadyActiveError'],
          target: PlanState.Idle,
        },
        [Event.ON_ACTIVE_CYCLE_EXISTS_ERROR]: {
          actions: ['emitActiveCycleExistsError'],
          target: PlanState.Idle,
        },
        [Event.ON_INVALID_PERIOD_COUNT_ERROR]: {
          actions: ['emitInvalidPeriodCountError'],
          target: PlanState.Idle,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['emitPeriodOverlapError'],
          target: PlanState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: PlanState.Idle,
        },
      },
    },
    [PlanState.HasActivePlan]: {
      on: {
        [Event.LOAD_ACTIVE_PLAN]: PlanState.LoadingActivePlan,
        [Event.LOAD_PLANS]: PlanState.LoadingPlans,
        [Event.LOAD_LAST_COMPLETED_CYCLE]: PlanState.LoadingLastCompletedCycle,
        [Event.CANCEL]: PlanState.Cancelling,
        [Event.UPDATE_PERIODS]: PlanState.UpdatingPeriods,
        [Event.SAVE_AS_TEMPLATE]: PlanState.SavingAsTemplate,
      },
    },
    [PlanState.NoPlan]: {
      on: {
        [Event.LOAD_ACTIVE_PLAN]: PlanState.LoadingActivePlan,
        [Event.LOAD_PLANS]: PlanState.LoadingPlans,
        [Event.LOAD_LAST_COMPLETED_CYCLE]: PlanState.LoadingLastCompletedCycle,
        [Event.CREATE]: PlanState.Creating,
      },
    },
    [PlanState.SavingAsTemplate]: {
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
          target: PlanState.HasActivePlan,
        },
        [Event.ON_TEMPLATE_LIMIT_REACHED]: {
          actions: ['emitTemplateLimitReached'],
          target: PlanState.HasActivePlan,
        },
        [Event.ON_ERROR]: {
          actions: ['emitTemplateSaveError'],
          target: PlanState.HasActivePlan,
        },
      },
    },
    [PlanState.Cancelling]: {
      invoke: {
        id: 'cancelPlanActor',
        src: 'cancelPlanActor',
        input: ({ event }) => {
          assertEvent(event, Event.CANCEL);
          return { planId: event.planId };
        },
      },
      on: {
        [Event.ON_CANCELLED]: {
          actions: ['updateCancelledPlan', 'emitPlanCancelled'],
          target: PlanState.NoPlan,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: PlanState.HasActivePlan,
        },
      },
    },
    [PlanState.UpdatingPeriods]: {
      invoke: {
        id: 'updatePeriodsActor',
        src: 'updatePeriodsActor',
        input: ({ event }) => {
          assertEvent(event, Event.UPDATE_PERIODS);
          return { planId: event.planId, payload: event.payload };
        },
      },
      on: {
        [Event.ON_PERIODS_UPDATED]: {
          actions: ['setUpdatedPlan', 'emitPeriodsUpdated'],
          target: PlanState.HasActivePlan,
        },
        [Event.ON_PERIOD_OVERLAP_ERROR]: {
          actions: ['emitPeriodOverlapError'],
          target: PlanState.HasActivePlan,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: PlanState.HasActivePlan,
        },
      },
    },
  },
});
