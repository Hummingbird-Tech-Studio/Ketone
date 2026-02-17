/**
 * Plan Template Edit Actor
 *
 * State machine for the Plan Template edit page.
 * Handles: load single template, update name/description/timeline individually.
 * Events carry domain-typed payloads (validated by composable before send).
 */
import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import {
  PeriodOrder,
  TemplatePeriodConfig,
  type PlanTemplateDetail,
  type PlanTemplateId,
} from '@/views/planTemplates/domain';
import type { UpdateTemplateDomainInput } from '@/views/planTemplates/input-validation/update-template-input.mapper';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programDuplicateWithModifiedTimeline,
  programGetTemplate,
  programUpdateTemplate,
} from '../services/plan-template-application.service';

// ============================================================================
// State / Event / Emit Enums
// ============================================================================

export enum PlanTemplateEditState {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
  UpdatingName = 'UpdatingName',
  UpdatingDescription = 'UpdatingDescription',
  UpdatingTimeline = 'UpdatingTimeline',
  SavingAsNew = 'SavingAsNew',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  UPDATE_NAME = 'UPDATE_NAME',
  UPDATE_DESCRIPTION = 'UPDATE_DESCRIPTION',
  UPDATE_TIMELINE = 'UPDATE_TIMELINE',
  SAVE_AS_NEW = 'SAVE_AS_NEW',
  RETRY = 'RETRY',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_UPDATE_SUCCESS = 'ON_UPDATE_SUCCESS',
  ON_SAVE_AS_NEW_SUCCESS = 'ON_SAVE_AS_NEW_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}

export enum Emit {
  TEMPLATE_LOADED = 'TEMPLATE_LOADED',
  NAME_UPDATED = 'NAME_UPDATED',
  DESCRIPTION_UPDATED = 'DESCRIPTION_UPDATED',
  TIMELINE_UPDATED = 'TIMELINE_UPDATED',
  SAVED_AS_NEW = 'SAVED_AS_NEW',
  ERROR = 'ERROR',
}

// ============================================================================
// Types
// ============================================================================

type EventType =
  | { type: Event.LOAD; planTemplateId: PlanTemplateId }
  | { type: Event.UPDATE_NAME; input: UpdateTemplateDomainInput }
  | { type: Event.UPDATE_DESCRIPTION; input: UpdateTemplateDomainInput }
  | { type: Event.UPDATE_TIMELINE; input: UpdateTemplateDomainInput }
  | {
      type: Event.SAVE_AS_NEW;
      periods: Array<{ fastingDuration: number; eatingWindow: number }>;
    }
  | { type: Event.RETRY }
  | { type: Event.ON_LOAD_SUCCESS; template: PlanTemplateDetail }
  | { type: Event.ON_UPDATE_SUCCESS; template: PlanTemplateDetail }
  | { type: Event.ON_SAVE_AS_NEW_SUCCESS }
  | { type: Event.ON_ERROR; error: string };

export type EmitType =
  | { type: Emit.TEMPLATE_LOADED; template: PlanTemplateDetail }
  | { type: Emit.NAME_UPDATED; template: PlanTemplateDetail }
  | { type: Emit.DESCRIPTION_UPDATED; template: PlanTemplateDetail }
  | { type: Emit.TIMELINE_UPDATED; template: PlanTemplateDetail }
  | { type: Emit.SAVED_AS_NEW }
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
    input: UpdateTemplateDomainInput;
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

const saveAsNewLogic = fromCallback<
  EventObject,
  {
    planTemplateId: PlanTemplateId;
    periods: Array<{ fastingDuration: number; eatingWindow: number }>;
  }
>(({ sendBack, input }) =>
  runWithUi(
    programDuplicateWithModifiedTimeline({
      planTemplateId: input.planTemplateId,
      periods: input.periods,
    }),
    () => sendBack({ type: Event.ON_SAVE_AS_NEW_SUCCESS }),
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
    emitNameUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.NAME_UPDATED, template: event.template };
    }),
    emitDescriptionUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.DESCRIPTION_UPDATED, template: event.template };
    }),
    emitTimelineUpdated: emit(({ event }) => {
      assertEvent(event, Event.ON_UPDATE_SUCCESS);
      return { type: Emit.TIMELINE_UPDATED, template: event.template };
    }),
    emitSavedAsNew: emit(() => {
      return { type: Emit.SAVED_AS_NEW } as const;
    }),
    emitError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.ERROR, error: event.error };
    }),
  },
  actors: {
    loadTemplateActor: loadTemplateLogic,
    updateTemplateActor: updateTemplateLogic,
    saveAsNewActor: saveAsNewLogic,
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
          if (event.type === Event.LOAD) return { planTemplateId: event.planTemplateId };
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
        [Event.UPDATE_NAME]: PlanTemplateEditState.UpdatingName,
        [Event.UPDATE_DESCRIPTION]: PlanTemplateEditState.UpdatingDescription,
        [Event.UPDATE_TIMELINE]: PlanTemplateEditState.UpdatingTimeline,
        [Event.SAVE_AS_NEW]: PlanTemplateEditState.SavingAsNew,
      },
    },
    [PlanTemplateEditState.UpdatingName]: {
      invoke: {
        id: 'updateNameActor',
        src: 'updateTemplateActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.UPDATE_NAME);
          return {
            planTemplateId: context.planTemplateId!,
            input: event.input,
          };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updateTemplate', 'emitNameUpdated'],
          target: PlanTemplateEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplateEditState.Ready,
        },
      },
    },
    [PlanTemplateEditState.UpdatingDescription]: {
      invoke: {
        id: 'updateDescriptionActor',
        src: 'updateTemplateActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.UPDATE_DESCRIPTION);
          return {
            planTemplateId: context.planTemplateId!,
            input: event.input,
          };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updateTemplate', 'emitDescriptionUpdated'],
          target: PlanTemplateEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplateEditState.Ready,
        },
      },
    },
    [PlanTemplateEditState.UpdatingTimeline]: {
      invoke: {
        id: 'updateTimelineActor',
        src: 'updateTemplateActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.UPDATE_TIMELINE);
          return {
            planTemplateId: context.planTemplateId!,
            input: event.input,
          };
        },
      },
      on: {
        [Event.ON_UPDATE_SUCCESS]: {
          actions: ['updateTemplate', 'emitTimelineUpdated'],
          target: PlanTemplateEditState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplateEditState.Ready,
        },
      },
    },
    [PlanTemplateEditState.SavingAsNew]: {
      invoke: {
        id: 'saveAsNewActor',
        src: 'saveAsNewActor',
        input: ({ context, event }) => {
          assertEvent(event, Event.SAVE_AS_NEW);
          return {
            planTemplateId: context.planTemplateId!,
            periods: event.periods,
          };
        },
      },
      on: {
        [Event.ON_SAVE_AS_NEW_SUCCESS]: {
          actions: ['emitSavedAsNew'],
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
