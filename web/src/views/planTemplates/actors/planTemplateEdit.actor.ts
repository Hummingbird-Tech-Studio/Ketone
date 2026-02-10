/**
 * Plan Template Edit Actor
 *
 * State machine for the Plan Template edit page.
 * Handles: load single template, update template.
 * Events carry domain-typed payloads (validated by composable before send).
 */
import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import {
  PeriodOrder,
  TemplatePeriodConfig,
  type EatingWindow,
  type FastingDuration,
  type PlanDescription,
  type PlanName,
  type PlanTemplateDetail,
  type PlanTemplateId,
} from '@/views/planTemplates/domain';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import { programGetTemplate, programUpdateTemplate } from '../services/plan-template-application.service';

// ============================================================================
// State / Event / Emit Enums
// ============================================================================

export enum PlanTemplateEditState {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
  Updating = 'Updating',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  UPDATE = 'UPDATE',
  RETRY = 'RETRY',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

export enum Emit {
  TEMPLATE_LOADED = 'TEMPLATE_LOADED',
  TEMPLATE_UPDATED = 'TEMPLATE_UPDATED',
  ERROR = 'ERROR',
}

// ============================================================================
// Types
// ============================================================================

/**
 * Domain-typed update input — validated by composable before sending.
 */
// Check this
export type UpdateInput = {
  name: PlanName;
  description: PlanDescription | null;
  periods: ReadonlyArray<{
    fastingDuration: FastingDuration;
    eatingWindow: EatingWindow;
  }>;
};

type EventType =
  | { type: Event.LOAD; planTemplateId: PlanTemplateId }
  | { type: Event.UPDATE; input: UpdateInput }
  | { type: Event.RETRY }
  | { type: Event.ON_LOAD_SUCCESS; template: PlanTemplateDetail }
  | { type: Event.ON_UPDATE_SUCCESS; template: PlanTemplateDetail }
  | { type: Event.ON_ERROR; error: string };

export type EmitType =
  | { type: Emit.TEMPLATE_LOADED; template: PlanTemplateDetail }
  | { type: Emit.TEMPLATE_UPDATED; template: PlanTemplateDetail }
  | { type: Emit.ERROR; error: string };

type Context = {
  planTemplateId: PlanTemplateId | null;
  template: PlanTemplateDetail | null;
  error: string | null;
};

// ============================================================================
// Callback Actors
// ============================================================================

const loadTemplateLogic = fromCallback<EventObject, { planTemplateId: PlanTemplateId }>(({ sendBack, input }) =>
  runWithUi(
    programGetTemplate(input.planTemplateId),
    (template) => sendBack({ type: Event.ON_LOAD_SUCCESS, template }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

const updateTemplateLogic = fromCallback<
  EventObject,
  {
    planTemplateId: PlanTemplateId;
    input: UpdateInput;
  }
>(({ sendBack, input }) =>
  runWithUi(
    programUpdateTemplate({
      planTemplateId: input.planTemplateId,
      name: input.input.name,
      description: input.input.description,
      periods: input.input.periods.map(
        (p, i) =>
          new TemplatePeriodConfig({
            order: PeriodOrder(i + 1),
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
          }),
      ),
    }),
    (template) => sendBack({ type: Event.ON_UPDATE_SUCCESS, template }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// ============================================================================
// Machine
// ============================================================================

export const planTemplateEditMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setTemplate: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return {
        planTemplateId: event.template.id,
        template: event.template,
        error: null,
      };
    }),
    updateTemplate: assign(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { template: event.template, error: null };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { error: event.error };
    }),
    storePlanTemplateId: assign(({ event }) => {
      assertEvent(event, Event.LOAD);
      return { planTemplateId: event.planTemplateId };
    }),
    emitLoaded: emit(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { type: Emit.TEMPLATE_LOADED, template: event.template };
    }),
    emitUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.TEMPLATE_UPDATED, template: event.template };
    }),
    emitError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.ERROR, error: event.error };
    }),
  },
  actors: {
    loadTemplateActor: loadTemplateLogic,
    updateTemplateActor: updateTemplateLogic,
  },
}).createMachine({
  id: 'planTemplateEdit',
  context: {
    planTemplateId: null,
    template: null,
    error: null,
  },
  initial: PlanTemplateEditState.Idle,
  states: {
    [PlanTemplateEditState.Idle]: {
      on: {
        [Event.LOAD]: {
          actions: ['storePlanTemplateId'],
          target: PlanTemplateEditState.Loading,
        },
      },
    },
    [PlanTemplateEditState.Loading]: {
      invoke: {
        id: 'loadTemplateActor',
        src: 'loadTemplateActor',
        input: ({ context, event }) => {
          // On initial LOAD, use event. On RETRY, use stored context.
          if (event.type === Event.LOAD) {
            assertEvent(event, Event.LOAD);
            return { planTemplateId: event.planTemplateId };
          }
          return { planTemplateId: context.planTemplateId! };
        },
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['setTemplate', 'emitLoaded'],
          target: PlanTemplateEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['setError'],
          target: PlanTemplateEditState.Error,
        },
      },
    },
    [PlanTemplateEditState.Ready]: {
      on: {
        [Event.UPDATE]: PlanTemplateEditState.Updating,
      },
    },
    [PlanTemplateEditState.Updating]: {
      invoke: {
        id: 'updateTemplateActor',
        src: 'updateTemplateActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.UPDATE);
          return {
            planTemplateId: context.planTemplateId!,
            input: event.input,
          };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updateTemplate', 'emitUpdated'],
          target: PlanTemplateEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplateEditState.Ready,
        },
      },
    },
    [PlanTemplateEditState.Error]: {
      on: {
        [Event.RETRY]: PlanTemplateEditState.Loading,
      },
    },
  },
});
