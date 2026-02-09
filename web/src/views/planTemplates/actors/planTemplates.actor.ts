/**
 * Plan Templates List Actor
 *
 * State machine for the Plan Templates list page.
 * Handles: load, duplicate, delete operations.
 * FC guards delegate to domain service pure functions.
 */
import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programListTemplates,
  programDuplicateTemplate,
  programDeleteTemplate,
} from '../services/plan-template.service';
import {
  type PlanTemplateId,
  type PlanTemplateSummary,
  type PlanTemplateDetail,
  MAX_PLAN_TEMPLATES,
} from '../domain/plan-template.model';
import { isTemplateLimitReached } from '../domain/services/plan-template-validation.service';

// ============================================================================
// State / Event / Emit Enums
// ============================================================================

export enum PlanTemplatesState {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
  Duplicating = 'Duplicating',
  Deleting = 'Deleting',
  Error = 'Error',
}

export enum Event {
  LOAD = 'LOAD',
  DUPLICATE = 'DUPLICATE',
  DELETE = 'DELETE',
  RETRY = 'RETRY',
  ON_LOAD_SUCCESS = 'ON_LOAD_SUCCESS',
  ON_DUPLICATE_SUCCESS = 'ON_DUPLICATE_SUCCESS',
  ON_DELETE_SUCCESS = 'ON_DELETE_SUCCESS',
  ON_ERROR = 'ON_ERROR',
  ON_LIMIT_REACHED = 'ON_LIMIT_REACHED',
}

export enum Emit {
  TEMPLATE_DUPLICATED = 'TEMPLATE_DUPLICATED',
  TEMPLATE_DELETED = 'TEMPLATE_DELETED',
  LIMIT_REACHED = 'LIMIT_REACHED',
  ERROR = 'ERROR',
}

// ============================================================================
// Types
// ============================================================================

type EventType =
  | { type: Event.LOAD }
  | { type: Event.DUPLICATE; planTemplateId: PlanTemplateId }
  | { type: Event.DELETE; planTemplateId: PlanTemplateId }
  | { type: Event.RETRY }
  | { type: Event.ON_LOAD_SUCCESS; templates: ReadonlyArray<PlanTemplateSummary> }
  | { type: Event.ON_DUPLICATE_SUCCESS; result: PlanTemplateDetail }
  | { type: Event.ON_DELETE_SUCCESS; planTemplateId: PlanTemplateId }
  | { type: Event.ON_ERROR; error: string }
  | { type: Event.ON_LIMIT_REACHED };

export type EmitType =
  | { type: Emit.TEMPLATE_DUPLICATED }
  | { type: Emit.TEMPLATE_DELETED }
  | { type: Emit.LIMIT_REACHED }
  | { type: Emit.ERROR; error: string };

type Context = {
  templates: ReadonlyArray<PlanTemplateSummary>;
  error: string | null;
};

// ============================================================================
// Callback Actors
// ============================================================================

const loadTemplatesLogic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programListTemplates(),
    (templates) => sendBack({ type: Event.ON_LOAD_SUCCESS, templates }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

const duplicateTemplateLogic = fromCallback<EventObject, { planTemplateId: PlanTemplateId }>(
  ({ sendBack, input }) =>
    runWithUi(
      programDuplicateTemplate(input.planTemplateId),
      (result) => sendBack({ type: Event.ON_DUPLICATE_SUCCESS, result }),
      (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
    ),
);

const deleteTemplateLogic = fromCallback<EventObject, { planTemplateId: PlanTemplateId }>(
  ({ sendBack, input }) =>
    runWithUi(
      programDeleteTemplate(input.planTemplateId),
      () => sendBack({ type: Event.ON_DELETE_SUCCESS, planTemplateId: input.planTemplateId }),
      (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
    ),
);

// ============================================================================
// Machine
// ============================================================================

export const planTemplatesMachine = setup({
  types: {
    context: {} as Context,
    events: {} as EventType,
    emitted: {} as EmitType,
  },
  actions: {
    setTemplates: assign(({ event }) => {
      assertEvent(event, Event.ON_LOAD_SUCCESS);
      return { templates: event.templates, error: null };
    }),
    addDuplicatedTemplate: assign(({ context, event }) => {
      assertEvent(event, Event.ON_DUPLICATE_SUCCESS);
      // Add the new template summary to the list
      const summary: PlanTemplateSummary = {
        id: event.result.id,
        name: event.result.name,
        description: event.result.description,
        periodCount: event.result.periodCount,
        updatedAt: event.result.updatedAt,
      } as PlanTemplateSummary;
      return { templates: [...context.templates, summary] };
    }),
    removeDeletedTemplate: assign(({ context, event }) => {
      assertEvent(event, Event.ON_DELETE_SUCCESS);
      return {
        templates: context.templates.filter((t) => t.id !== event.planTemplateId),
      };
    }),
    setError: assign(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { error: event.error };
    }),
    emitDuplicated: emit(() => ({ type: Emit.TEMPLATE_DUPLICATED })),
    emitDeleted: emit(() => ({ type: Emit.TEMPLATE_DELETED })),
    emitLimitReached: emit(() => ({ type: Emit.LIMIT_REACHED })),
    emitError: emit(({ event }) => {
      assertEvent(event, Event.ON_ERROR);
      return { type: Emit.ERROR, error: event.error };
    }),
  },
  guards: {
    // FC guard: delegate to domain validation service pure function
    canDuplicate: ({ context }) =>
      !isTemplateLimitReached(context.templates.length, MAX_PLAN_TEMPLATES),
  },
  actors: {
    loadTemplatesActor: loadTemplatesLogic,
    duplicateTemplateActor: duplicateTemplateLogic,
    deleteTemplateActor: deleteTemplateLogic,
  },
}).createMachine({
  id: 'planTemplates',
  context: {
    templates: [],
    error: null,
  },
  initial: PlanTemplatesState.Idle,
  states: {
    [PlanTemplatesState.Idle]: {
      on: {
        [Event.LOAD]: PlanTemplatesState.Loading,
      },
    },
    [PlanTemplatesState.Loading]: {
      invoke: {
        id: 'loadTemplatesActor',
        src: 'loadTemplatesActor',
      },
      on: {
        [Event.ON_LOAD_SUCCESS]: {
          actions: ['setTemplates'],
          target: PlanTemplatesState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['setError'],
          target: PlanTemplatesState.Error,
        },
      },
    },
    [PlanTemplatesState.Ready]: {
      on: {
        [Event.LOAD]: PlanTemplatesState.Loading,
        [Event.DUPLICATE]: [
          {
            guard: 'canDuplicate',
            target: PlanTemplatesState.Duplicating,
          },
          {
            actions: ['emitLimitReached'],
          },
        ],
        [Event.DELETE]: PlanTemplatesState.Deleting,
      },
    },
    [PlanTemplatesState.Duplicating]: {
      invoke: {
        id: 'duplicateTemplateActor',
        src: 'duplicateTemplateActor',
        input: ({ event }) => {
          assertEvent(event, Event.DUPLICATE);
          return { planTemplateId: event.planTemplateId };
        },
      },
      on: {
        [Event.ON_DUPLICATE_SUCCESS]: {
          actions: ['addDuplicatedTemplate', 'emitDuplicated'],
          target: PlanTemplatesState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplatesState.Ready,
        },
      },
    },
    [PlanTemplatesState.Deleting]: {
      invoke: {
        id: 'deleteTemplateActor',
        src: 'deleteTemplateActor',
        input: ({ event }) => {
          assertEvent(event, Event.DELETE);
          return { planTemplateId: event.planTemplateId };
        },
      },
      on: {
        [Event.ON_DELETE_SUCCESS]: {
          actions: ['removeDeletedTemplate', 'emitDeleted'],
          target: PlanTemplatesState.Ready,
        },
        [Event.ON_ERROR]: {
          actions: ['emitError'],
          target: PlanTemplatesState.Ready,
        },
      },
    },
    [PlanTemplatesState.Error]: {
      on: {
        [Event.RETRY]: PlanTemplatesState.Loading,
      },
    },
  },
});
