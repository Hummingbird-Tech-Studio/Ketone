import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { Match } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programCancelPlan,
  programCreatePlan,
  programDeletePlan,
  programGetActivePlan,
  programGetPlan,
  programListPlans,
  type CancelPlanError,
  type CancelPlanSuccess,
  type CreatePlanError,
  type CreatePlanPayload,
  type DeletePlanError,
  type GetActivePlanError,
  type GetActivePlanSuccess,
  type GetPlanSuccess,
  type ListPlansSuccess,
} from '../services/plan.service';

/**
 * Plan Actor States
 */
export enum PlanState {
  Idle = 'Idle',
  LoadingActivePlan = 'LoadingActivePlan',
  LoadingPlan = 'LoadingPlan',
  LoadingPlans = 'LoadingPlans',
  Creating = 'Creating',
  Cancelling = 'Cancelling',
  Deleting = 'Deleting',
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
  CREATE = 'CREATE',
  CANCEL = 'CANCEL',
  DELETE = 'DELETE',
  REFRESH = 'REFRESH',
  // Callback events
  ON_ACTIVE_PLAN_LOADED = 'ON_ACTIVE_PLAN_LOADED',
  ON_PLAN_LOADED = 'ON_PLAN_LOADED',
  ON_PLANS_LOADED = 'ON_PLANS_LOADED',
  ON_NO_ACTIVE_PLAN = 'ON_NO_ACTIVE_PLAN',
  ON_CREATED = 'ON_CREATED',
  ON_CANCELLED = 'ON_CANCELLED',
  ON_DELETED = 'ON_DELETED',
  ON_ERROR = 'ON_ERROR',
  ON_ALREADY_ACTIVE_ERROR = 'ON_ALREADY_ACTIVE_ERROR',
  ON_ACTIVE_CYCLE_EXISTS_ERROR = 'ON_ACTIVE_CYCLE_EXISTS_ERROR',
  ON_INVALID_PERIOD_COUNT_ERROR = 'ON_INVALID_PERIOD_COUNT_ERROR',
}

type EventType =
  | { type: Event.LOAD_ACTIVE_PLAN }
  | { type: Event.LOAD_PLAN; planId: string }
  | { type: Event.LOAD_PLANS }
  | { type: Event.CREATE; payload: CreatePlanPayload }
  | { type: Event.CANCEL; planId: string }
  | { type: Event.DELETE; planId: string }
  | { type: Event.REFRESH }
  | { type: Event.ON_ACTIVE_PLAN_LOADED; result: GetActivePlanSuccess }
  | { type: Event.ON_PLAN_LOADED; result: GetPlanSuccess }
  | { type: Event.ON_PLANS_LOADED; result: ListPlansSuccess }
  | { type: Event.ON_NO_ACTIVE_PLAN }
  | { type: Event.ON_CREATED; result: GetActivePlanSuccess }
  | { type: Event.ON_CANCELLED; result: CancelPlanSuccess }
  | { type: Event.ON_DELETED; planId: string }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_ALREADY_ACTIVE_ERROR; message: string; userId?: string }
  | { type: Event.ON_ACTIVE_CYCLE_EXISTS_ERROR; message: string; userId?: string }
  | {
      type: Event.ON_INVALID_PERIOD_COUNT_ERROR;
      message: string;
      periodCount: number;
      minPeriods: number;
      maxPeriods: number;
    };

/**
 * Plan Actor Emits
 */
export enum Emit {
  PLAN_LOADED = 'PLAN_LOADED',
  PLAN_CREATED = 'PLAN_CREATED',
  PLAN_CANCELLED = 'PLAN_CANCELLED',
  PLAN_DELETED = 'PLAN_DELETED',
  PLAN_ERROR = 'PLAN_ERROR',
  ALREADY_ACTIVE_ERROR = 'ALREADY_ACTIVE_ERROR',
  ACTIVE_CYCLE_EXISTS_ERROR = 'ACTIVE_CYCLE_EXISTS_ERROR',
  INVALID_PERIOD_COUNT_ERROR = 'INVALID_PERIOD_COUNT_ERROR',
}

export type EmitType =
  | { type: Emit.PLAN_LOADED; plan: GetActivePlanSuccess }
  | { type: Emit.PLAN_CREATED; plan: GetActivePlanSuccess }
  | { type: Emit.PLAN_CANCELLED; plan: CancelPlanSuccess }
  | { type: Emit.PLAN_DELETED; planId: string }
  | { type: Emit.PLAN_ERROR; error: string }
  | { type: Emit.ALREADY_ACTIVE_ERROR; message: string }
  | { type: Emit.ACTIVE_CYCLE_EXISTS_ERROR; message: string }
  | { type: Emit.INVALID_PERIOD_COUNT_ERROR; message: string; periodCount: number };

type PlanWithPeriods = GetActivePlanSuccess;
type PlanSummary = ListPlansSuccess[number];

type Context = {
  activePlan: PlanWithPeriods | null;
  selectedPlan: PlanWithPeriods | null;
  plans: PlanSummary[];
};

function getInitialContext(): Context {
  return {
    activePlan: null,
    selectedPlan: null,
    plans: [],
  };
}

/**
 * Handles errors from plan operations, detecting specific error types
 */
function handlePlanError(error: CreatePlanError | CancelPlanError | DeletePlanError | GetActivePlanError) {
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

// Delete plan logic
const deletePlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programDeletePlan(input.planId),
    () => sendBack({ type: Event.ON_DELETED, planId: input.planId }),
    (error) => sendBack(handlePlanError(error)),
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
    removePlan: assign(({ context, event }) => {
      assertEvent(event, Event.ON_DELETED);
      return {
        plans: context.plans.filter((p) => p.id !== event.planId),
        selectedPlan: context.selectedPlan?.id === event.planId ? null : context.selectedPlan,
      };
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
    emitPlanDeleted: emit(({ event }) => {
      assertEvent(event, Event.ON_DELETED);
      return { type: Emit.PLAN_DELETED, planId: event.planId };
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
  },
  actors: {
    loadActivePlanActor: loadActivePlanLogic,
    loadPlanActor: loadPlanLogic,
    loadPlansActor: loadPlansLogic,
    createPlanActor: createPlanLogic,
    cancelPlanActor: cancelPlanLogic,
    deletePlanActor: deletePlanLogic,
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
        [Event.CREATE]: PlanState.Creating,
        [Event.DELETE]: PlanState.Deleting,
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
        [Event.CANCEL]: PlanState.Cancelling,
      },
    },
    [PlanState.NoPlan]: {
      on: {
        [Event.LOAD_ACTIVE_PLAN]: PlanState.LoadingActivePlan,
        [Event.LOAD_PLANS]: PlanState.LoadingPlans,
        [Event.CREATE]: PlanState.Creating,
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
    [PlanState.Deleting]: {
      invoke: {
        id: 'deletePlanActor',
        src: 'deletePlanActor',
        input: ({ event }) => {
          assertEvent(event, Event.DELETE);
          return { planId: event.planId };
        },
      },
      on: {
        [Event.ON_DELETED]: {
          actions: ['removePlan', 'emitPlanDeleted'],
          target: PlanState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: PlanState.Idle,
        },
      },
    },
  },
});
