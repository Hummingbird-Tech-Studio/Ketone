import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { programGetActivePlan, type GetActivePlanSuccess } from '@/views/plan/services/plan.service';
import type { PeriodResponse } from '@ketone/shared';
import { Match } from 'effect';
import { assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { timerLogic } from './shared/timerLogic';

/**
 * Ensures a value is a Date object
 */
function ensureDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

/**
 * Determines which window phase the current period is in based on the current time.
 * Uses explicit phase timestamps from the API response.
 */
function determineWindowPhase(period: PeriodResponse, now: Date): 'fasting' | 'eating' | null {
  const fastingStart = ensureDate(period.fastingStartDate);
  const fastingEnd = ensureDate(period.fastingEndDate);
  const eatingEnd = ensureDate(period.eatingEndDate);

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
 * Finds the current in-progress period from the plan.
 * First checks for a period with status 'in_progress', then falls back to finding by time.
 */
function findCurrentPeriod(plan: GetActivePlanSuccess): PeriodResponse | null {
  // First try to find by status
  const inProgressPeriod = plan.periods.find((p) => p.status === 'in_progress');
  if (inProgressPeriod) {
    return inProgressPeriod;
  }

  // Fall back to finding by current time
  const now = new Date();
  return plan.periods.find((p) => {
    const startDate = ensureDate(p.startDate);
    const endDate = ensureDate(p.endDate);
    return now >= startDate && now < endDate;
  }) ?? null;
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

export enum ActivePlanState {
  Idle = 'Idle',
  Loading = 'Loading',
  InFastingWindow = 'InFastingWindow',
  InEatingWindow = 'InEatingWindow',
  PeriodCompleted = 'PeriodCompleted',
  AllPeriodsCompleted = 'AllPeriodsCompleted',
}

export enum Event {
  TICK = 'TICK',
  LOAD = 'LOAD',
  REFRESH = 'REFRESH',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_NO_ACTIVE_PLAN = 'ON_NO_ACTIVE_PLAN',
  ON_ERROR = 'ON_ERROR',
}

type EventType =
  | { type: Event.TICK }
  | { type: Event.LOAD }
  | { type: Event.REFRESH }
  | { type: Event.ON_SUCCESS; result: GetActivePlanSuccess }
  | { type: Event.ON_NO_ACTIVE_PLAN }
  | { type: Event.ON_ERROR; error: string };

export enum Emit {
  TICK = 'TICK',
  PLAN_ERROR = 'PLAN_ERROR',
  NO_ACTIVE_PLAN = 'NO_ACTIVE_PLAN',
}

export type EmitType =
  | { type: Emit.TICK }
  | { type: Emit.PLAN_ERROR; error: string }
  | { type: Emit.NO_ACTIVE_PLAN };

type Context = {
  activePlan: GetActivePlanSuccess | null;
  currentPeriod: PeriodResponse | null;
  windowPhase: 'fasting' | 'eating' | null;
};

function getInitialContextValues(): Omit<Context, never> {
  return {
    activePlan: null,
    currentPeriod: null,
    windowPhase: null,
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
  },
  guards: {
    isInFastingWindowFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      const fastingStart = ensureDate(currentPeriod.fastingStartDate);
      const fastingEnd = ensureDate(currentPeriod.fastingEndDate);
      return now >= fastingStart && now < fastingEnd;
    },
    isInEatingWindowFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      const fastingEnd = ensureDate(currentPeriod.fastingEndDate);
      const eatingEnd = ensureDate(currentPeriod.eatingEndDate);
      return now >= fastingEnd && now < eatingEnd;
    },
    isPeriodCompletedFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const currentPeriod = findCurrentPeriod(event.result);
      if (!currentPeriod) return false;
      const now = new Date();
      const eatingEnd = ensureDate(currentPeriod.eatingEndDate);
      return now >= eatingEnd;
    },
    allPeriodsCompletedFromEvent: ({ event }) => {
      if (event.type !== Event.ON_SUCCESS) return false;
      const periods = event.result.periods;
      if (periods.length === 0) return false;

      // Check if all periods have status 'completed'
      const allStatusCompleted = periods.every((p) => p.status === 'completed');
      if (allStatusCompleted) return true;

      // Also check if all periods have ended based on time (fallback)
      const now = new Date();
      const lastPeriod = periods[periods.length - 1];
      if (!lastPeriod) return false;
      const lastEatingEnd = ensureDate(lastPeriod.eatingEndDate);
      return now >= lastEatingEnd;
    },
    isInEatingWindow: ({ context }) => {
      if (!context.currentPeriod) return false;
      const now = new Date();
      const fastingEnd = ensureDate(context.currentPeriod.fastingEndDate);
      const eatingEnd = ensureDate(context.currentPeriod.eatingEndDate);
      return now >= fastingEnd && now < eatingEnd;
    },
    isPeriodCompleted: ({ context }) => {
      if (!context.currentPeriod) return false;
      const now = new Date();
      const eatingEnd = ensureDate(context.currentPeriod.eatingEndDate);
      return now >= eatingEnd;
    },
    hasNextPeriodInFasting: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      if (!nextPeriod) return false;
      const now = new Date();
      const fastingStart = ensureDate(nextPeriod.fastingStartDate);
      const fastingEnd = ensureDate(nextPeriod.fastingEndDate);
      return now >= fastingStart && now < fastingEnd;
    },
    hasNextPeriodInEating: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      if (!nextPeriod) return false;
      const now = new Date();
      const fastingEnd = ensureDate(nextPeriod.fastingEndDate);
      const eatingEnd = ensureDate(nextPeriod.eatingEndDate);
      return now >= fastingEnd && now < eatingEnd;
    },
    hasNextPeriodScheduled: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      return nextPeriod !== null;
    },
    noMorePeriods: ({ context }) => {
      if (!context.activePlan || !context.currentPeriod) return false;
      const nextPeriod = findNextPeriod(context.activePlan, context.currentPeriod);
      return nextPeriod === null;
    },
  },
  actors: {
    timerActor: timerLogic,
    loadActivePlanActor: loadActivePlanLogic,
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
            target: ActivePlanState.AllPeriodsCompleted,
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
      },
    },
    [ActivePlanState.PeriodCompleted]: {
      always: [
        {
          guard: 'noMorePeriods',
          target: ActivePlanState.AllPeriodsCompleted,
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
      },
    },
    [ActivePlanState.AllPeriodsCompleted]: {},
  },
});
