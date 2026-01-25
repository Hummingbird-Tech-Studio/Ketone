import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import {
  programCancelPlan,
  programCompletePlan,
  programGetActivePlan,
  type GetActivePlanSuccess,
} from '@/views/plan/services/plan.service';
import type { PeriodResponse } from '@ketone/shared';
import { Match } from 'effect';
import { assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { timerLogic } from './shared/timerLogic';

/**
 * Determines which window phase the current period is in based on the current time.
 * Uses explicit phase timestamps from the API response.
 */
function determineWindowPhase(period: PeriodResponse, now: Date): 'fasting' | 'eating' | null {
  const fastingStart = period.fastingStartDate;
  const fastingEnd = period.fastingEndDate;
  const eatingEnd = period.eatingEndDate;

  if (now < fastingStart) {
    return null;
  }

  if (now >= fastingStart && now < fastingEnd) {
    return 'fasting';
  }

  if (now >= fastingEnd && now < eatingEnd) {
    return 'eating';
  }

  return null;
}

/**
 * Finds the current in-progress period from the plan based on time.
 */
function findCurrentPeriod(plan: GetActivePlanSuccess): PeriodResponse | null {
  const now = new Date();
  return plan.periods.find((p) => now >= p.startDate && now < p.endDate) ?? null;
}

/**
 * Finds the next period after the current one.
 */
function findNextPeriod(plan: GetActivePlanSuccess, currentPeriod: PeriodResponse): PeriodResponse | null {
  const currentIndex = plan.periods.findIndex((p) => p.id === currentPeriod.id);
  if (currentIndex === -1 || currentIndex >= plan.periods.length - 1) {
    return null;
  }
  return plan.periods[currentIndex + 1] ?? null;
}

/**
 * Finds the first period of the plan (sorted by start date).
 */
function findFirstPeriod(plan: GetActivePlanSuccess): PeriodResponse | null {
  if (plan.periods.length === 0) return null;
  const sorted = [...plan.periods].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return sorted[0] ?? null;
}

export enum ActivePlanState {
  Idle = 'Idle',
  Loading = 'Loading',
  WaitingForPlanStart = 'WaitingForPlanStart',
  InFastingWindow = 'InFastingWindow',
  InEatingWindow = 'InEatingWindow',
  PeriodCompleted = 'PeriodCompleted',
  CompletingPlan = 'CompletingPlan',
  CompletePlanError = 'CompletePlanError',
  AllPeriodsCompleted = 'AllPeriodsCompleted',
  EndingPlan = 'EndingPlan',
  EndPlanError = 'EndPlanError',
  PlanEnded = 'PlanEnded',
}

export enum Event {
  TICK = 'TICK',
  LOAD = 'LOAD',
  REFRESH = 'REFRESH',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_NO_ACTIVE_PLAN = 'ON_NO_ACTIVE_PLAN',
  ON_ERROR = 'ON_ERROR',
  ON_COMPLETE_SUCCESS = 'ON_COMPLETE_SUCCESS',
  ON_COMPLETE_ERROR = 'ON_COMPLETE_ERROR',
  RETRY_COMPLETE = 'RETRY_COMPLETE',
  END_PLAN = 'END_PLAN',
  ON_END_SUCCESS = 'ON_END_SUCCESS',
  ON_END_ERROR = 'ON_END_ERROR',
  RETRY_END = 'RETRY_END',
}

type EventType =
  | { type: Event.TICK }
  | { type: Event.LOAD }
  | { type: Event.REFRESH }
  | { type: Event.ON_SUCCESS; result: GetActivePlanSuccess }
  | { type: Event.ON_NO_ACTIVE_PLAN }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_COMPLETE_SUCCESS }
  | { type: Event.ON_COMPLETE_ERROR; error: string }
  | { type: Event.RETRY_COMPLETE }
  | { type: Event.END_PLAN }
  | { type: Event.ON_END_SUCCESS }
  | { type: Event.ON_END_ERROR; error: string }
  | { type: Event.RETRY_END };

export enum Emit {
  TICK = 'TICK',
  PLAN_ERROR = 'PLAN_ERROR',
  NO_ACTIVE_PLAN = 'NO_ACTIVE_PLAN',
  PLAN_ENDED = 'PLAN_ENDED',
  PLAN_END_ERROR = 'PLAN_END_ERROR',
}

export type EmitType =
  | { type: Emit.TICK }
  | { type: Emit.PLAN_ERROR; error: string }
  | { type: Emit.NO_ACTIVE_PLAN }
  | { type: Emit.PLAN_ENDED }
  | { type: Emit.PLAN_END_ERROR; error: string };

type Context = {
  activePlan: GetActivePlanSuccess | null;
  currentPeriod: PeriodResponse | null;
  windowPhase: 'fasting' | 'eating' | null;
  completeError: string | null;
  endError: string | null;
  endedAt: Date | null;
};

function getInitialContextValues(): Omit<Context, never> {
  return {
    activePlan: null,
    currentPeriod: null,
    windowPhase: null,
    completeError: null,
    endError: null,
    endedAt: null,
  };
}

const loadActivePlanLogic = fromCallback<EventObject, void>(({ sendBack }) =>
  runWithUi(
    programGetActivePlan(),
    (result) => {
      sendBack({ type: Event.ON_SUCCESS, result });
    },
    (error) => {
      Match.value(error).pipe(
        Match.when({ _tag: 'NoActivePlanError' }, () => {
          sendBack({ type: Event.ON_NO_ACTIVE_PLAN });
        }),
        Match.orElse((err) => {
          sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(err) });
        }),
      );
    },
  ),
);

const completePlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programCompletePlan(input.planId),
    () => {
      sendBack({ type: Event.ON_COMPLETE_SUCCESS });
    },
    (error) => {
      sendBack({ type: Event.ON_COMPLETE_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

const endPlanLogic = fromCallback<EventObject, { planId: string }>(({ sendBack, input }) =>
  runWithUi(
    programCancelPlan(input.planId),
    () => {
      sendBack({ type: Event.ON_END_SUCCESS });
    },
    (error) => {
      sendBack({ type: Event.ON_END_ERROR, error: extractErrorMessage(error) });
    },
  ),
);

export const activePlanMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setActivePlanData: assign(({ event }) => {
      if (event.type !== Event.ON_SUCCESS) {
        return {};
      }

      const currentPeriod = findCurrentPeriod(event.result);
      const windowPhase = currentPeriod ? determineWindowPhase(currentPeriod, new Date()) : null;

      return {
        activePlan: event.result,
        currentPeriod,
        windowPhase,
      };
    }),
    updateWindowPhase: assign(({ context }) => {
      if (!context.currentPeriod) {
        return { windowPhase: null };
      }

      return {
        windowPhase: determineWindowPhase(context.currentPeriod, new Date()),
      };
    }),
    moveToNextPeriod: assign(({ context }) => {
      if (!context.activePlan || !context.currentPeriod) {
        return {};
      }

      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      if (!nextPeriod) {
        return {};
      }

      const windowPhase = determineWindowPhase(nextPeriod, new Date());

      return {
        currentPeriod: nextPeriod,
        windowPhase,
      };
    }),
    emitPlanError: emit(({ event }) => {
      if (event.type !== Event.ON_ERROR) {
        return { type: Emit.PLAN_ERROR, error: 'Unknown error' };
      }

      return {
        type: Emit.PLAN_ERROR,
        error: event.error,
      };
    }),
    emitNoActivePlan: emit(() => ({
      type: Emit.NO_ACTIVE_PLAN,
    })),
    resetContext: assign(() => getInitialContextValues()),
    setCompleteError: assign(({ event }) => {
      if (event.type !== Event.ON_COMPLETE_ERROR) {
        return { completeError: 'Unknown error' };
      }
      return { completeError: event.error };
    }),
    clearCompleteError: assign(() => ({ completeError: null })),
    setEndError: assign(({ event }) => {
      if (event.type !== Event.ON_END_ERROR) {
        return { endError: 'Unknown error' };
      }
      return { endError: event.error };
    }),
    clearEndError: assign(() => ({ endError: null })),
    emitPlanEnded: emit(() => ({
      type: Emit.PLAN_ENDED,
    })),
    emitPlanEndError: emit(({ event }) => {
      if (event.type !== Event.ON_END_ERROR) {
        return { type: Emit.PLAN_END_ERROR, error: 'Unknown error' };
      }
      return {
        type: Emit.PLAN_END_ERROR,
        error: event.error,
      };
    }),
    captureEndedAt: assign(() => ({
      endedAt: new Date(),
    })),
    setFirstPeriodAsCurrentPeriod: assign(({ event }) => {
      if (event.type !== Event.ON_SUCCESS) {
        return {};
      }

      const firstPeriod = findFirstPeriod(event.result);
      return {
        activePlan: event.result,
        currentPeriod: firstPeriod,
        windowPhase: null,
      };
    }),
  },
  guards: {
    isInFastingWindowFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      return now >= currentPeriod.fastingStartDate && now < currentPeriod.fastingEndDate;
    },
    isInEatingWindowFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      return now >= currentPeriod.fastingEndDate && now < currentPeriod.eatingEndDate;
    },
    isPeriodCompletedFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      return now >= currentPeriod.eatingEndDate;
    },
    allPeriodsCompletedFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const periods = event.result.periods;
      if (periods.length === 0) return false;

      const now = new Date();
      const lastPeriod = periods[periods.length - 1];
      if (!lastPeriod) return false;
      return now >= lastPeriod.eatingEndDate;
    },
    isInEatingWindow: ({ context }) => {
      if (!context.currentPeriod) return false;
      const now = new Date();
      return now >= context.currentPeriod.fastingEndDate && now < context.currentPeriod.eatingEndDate;
    },
    isPeriodCompleted: ({ context }) => {
      if (!context.currentPeriod) return false;
      const now = new Date();
      return now >= context.currentPeriod.eatingEndDate;
    },
    hasNextPeriodInFasting: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      if (!nextPeriod) return false;
      const now = new Date();
      return now >= nextPeriod.fastingStartDate && now < nextPeriod.fastingEndDate;
    },
    hasNextPeriodInEating: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      if (!nextPeriod) return false;
      const now = new Date();
      return now >= nextPeriod.fastingEndDate && now < nextPeriod.eatingEndDate;
    },
    noMorePeriods: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      return nextPeriod === null;
    },
    isWaitingForPlanStartFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const firstPeriod = findFirstPeriod(event.result);
      if (!firstPeriod) return false;
      const now = new Date();
      return now < firstPeriod.fastingStartDate;
    },
    hasPlanStarted: ({ context }) => {
      if (!context.currentPeriod) return false;
      const now = new Date();
      return now >= context.currentPeriod.fastingStartDate;
    },
  },
  actors: {
    timerActor: timerLogic,
    loadActivePlanActor: loadActivePlanLogic,
    completePlanActor: completePlanLogic,
    endPlanActor: endPlanLogic,
  },
}).createMachine({
  id: 'activePlan',
  context: getInitialContextValues(),
  initial: ActivePlanState.Loading,
  on: {
    [Event.REFRESH]: {
      actions: ['resetContext'],
      target: `.${ActivePlanState.Loading}`,
    },
  },
  states: {
    [ActivePlanState.Loading]: {
      invoke: {
        id: 'loadActivePlanActor',
        src: 'loadActivePlanActor',
      },
      on: {
        [Event.ON_SUCCESS]: [
          {
            guard: 'allPeriodsCompletedFromEvent',
            actions: ['setActivePlanData'],
            target: ActivePlanState.CompletingPlan,
          },
          {
            guard: 'isWaitingForPlanStartFromEvent',
            actions: ['setFirstPeriodAsCurrentPeriod'],
            target: ActivePlanState.WaitingForPlanStart,
          },
          {
            guard: 'isInFastingWindowFromEvent',
            actions: ['setActivePlanData'],
            target: ActivePlanState.InFastingWindow,
          },
          {
            guard: 'isInEatingWindowFromEvent',
            actions: ['setActivePlanData'],
            target: ActivePlanState.InEatingWindow,
          },
          {
            guard: 'isPeriodCompletedFromEvent',
            actions: ['setActivePlanData'],
            target: ActivePlanState.PeriodCompleted,
          },
          {
            actions: ['setActivePlanData'],
            target: ActivePlanState.Idle,
          },
        ],
        [Event.ON_NO_ACTIVE_PLAN]: {
          actions: ['emitNoActivePlan'],
          target: ActivePlanState.Idle,
        },
        [Event.ON_ERROR]: {
          actions: ['emitPlanError'],
          target: ActivePlanState.Idle,
        },
      },
    },
    [ActivePlanState.Idle]: {},
    [ActivePlanState.WaitingForPlanStart]: {
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: [
          {
            guard: 'hasPlanStarted',
            actions: ['updateWindowPhase'],
            target: ActivePlanState.InFastingWindow,
          },
          {
            actions: [emit({ type: Emit.TICK })],
          },
        ],
        [Event.END_PLAN]: {
          actions: ['captureEndedAt'],
          target: ActivePlanState.EndingPlan,
        },
      },
    },
    [ActivePlanState.InFastingWindow]: {
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: [
          {
            guard: 'isInEatingWindow',
            actions: ['updateWindowPhase'],
            target: ActivePlanState.InEatingWindow,
          },
          {
            actions: [emit({ type: Emit.TICK })],
          },
        ],
        [Event.END_PLAN]: {
          actions: ['captureEndedAt'],
          target: ActivePlanState.EndingPlan,
        },
      },
    },
    [ActivePlanState.InEatingWindow]: {
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: [
          {
            guard: 'isPeriodCompleted',
            actions: ['updateWindowPhase'],
            target: ActivePlanState.PeriodCompleted,
          },
          {
            actions: [emit({ type: Emit.TICK })],
          },
        ],
        [Event.END_PLAN]: {
          actions: ['captureEndedAt'],
          target: ActivePlanState.EndingPlan,
        },
      },
    },
    [ActivePlanState.PeriodCompleted]: {
      always: [
        {
          guard: 'noMorePeriods',
          target: ActivePlanState.CompletingPlan,
        },
      ],
      invoke: {
        id: 'timerActor',
        src: 'timerActor',
      },
      on: {
        [Event.TICK]: [
          {
            guard: 'hasNextPeriodInFasting',
            actions: ['moveToNextPeriod'],
            target: ActivePlanState.InFastingWindow,
          },
          {
            guard: 'hasNextPeriodInEating',
            actions: ['moveToNextPeriod'],
            target: ActivePlanState.InEatingWindow,
          },
          {
            actions: [emit({ type: Emit.TICK })],
          },
        ],
        [Event.END_PLAN]: {
          actions: ['captureEndedAt'],
          target: ActivePlanState.EndingPlan,
        },
      },
    },
    [ActivePlanState.CompletingPlan]: {
      invoke: {
        id: 'completePlanActor',
        src: 'completePlanActor',
        input: ({ context }) => ({
          planId: context.activePlan?.id ?? '',
        }),
      },
      on: {
        [Event.ON_COMPLETE_SUCCESS]: {
          target: ActivePlanState.AllPeriodsCompleted,
        },
        [Event.ON_COMPLETE_ERROR]: {
          actions: ['setCompleteError'],
          target: ActivePlanState.CompletePlanError,
        },
      },
    },
    [ActivePlanState.CompletePlanError]: {
      on: {
        [Event.RETRY_COMPLETE]: {
          actions: ['clearCompleteError'],
          target: ActivePlanState.CompletingPlan,
        },
      },
    },
    [ActivePlanState.AllPeriodsCompleted]: {},
    [ActivePlanState.EndingPlan]: {
      invoke: {
        id: 'endPlanActor',
        src: 'endPlanActor',
        input: ({ context }) => ({
          planId: context.activePlan?.id ?? '',
        }),
      },
      on: {
        [Event.ON_END_SUCCESS]: {
          actions: ['emitPlanEnded'],
          target: ActivePlanState.PlanEnded,
        },
        [Event.ON_END_ERROR]: {
          actions: ['setEndError', 'emitPlanEndError'],
          target: ActivePlanState.EndPlanError,
        },
      },
    },
    [ActivePlanState.EndPlanError]: {
      on: {
        [Event.RETRY_END]: {
          actions: ['clearEndError'],
          target: ActivePlanState.EndingPlan,
        },
      },
    },
    [ActivePlanState.PlanEnded]: {},
  },
});
