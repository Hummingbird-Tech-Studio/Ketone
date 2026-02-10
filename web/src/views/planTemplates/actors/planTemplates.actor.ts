/**
 * Plan Templates List Actor
 *
 * State machine for the Plan Templates list page.
 * Handles: load, duplicate, delete operations.
 * Domain computations (sort, cards, limit) live in context via FC service adapters.
 */
import { extractErrorMessage } from '@/services/http/errors';
import { runWithUi } from '@/utils/effects/helpers';
import {
  MAX_PLAN_TEMPLATES,
  matchSaveDecision,
  type PlanTemplateDetail,
  type PlanTemplateId,
  type PlanTemplateSummary,
  PlanTemplateDomainService,
  PlanTemplateValidationService,
} from '@/views/planTemplates/domain';
import { Effect } from 'effect';
import { assertEvent, assign, emit, fromCallback, setup, type EventObject } from 'xstate';
import {
  programDeleteTemplate,
  programDuplicateTemplate,
  programListTemplates,
} from '../services/plan-template.service';

// ============================================================================
// Sync Adapters — resolve Effect.Service instances for synchronous actor use
// ============================================================================

const domainSvc = Effect.runSync(
  PlanTemplateDomainService.pipe(Effect.provide(PlanTemplateDomainService.Default)),
);
const validationSvc = Effect.runSync(
  PlanTemplateValidationService.pipe(Effect.provide(PlanTemplateValidationService.Default)),
);

// ============================================================================
// View Model Types
// ============================================================================

export type TemplateCardVM = {
  id: PlanTemplateId;
  name: string;
  description: string | null;
  periodCountLabel: string;
  updatedAt: Date;
};

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
  REQUEST_DELETE = 'REQUEST_DELETE',
  CONFIRM_DELETE = 'CONFIRM_DELETE',
  CANCEL_DELETE = 'CANCEL_DELETE',
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
  | { type: Event.REQUEST_DELETE; planTemplateId: PlanTemplateId; name: string }
  | { type: Event.CONFIRM_DELETE }
  | { type: Event.CANCEL_DELETE }
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
  cards: ReadonlyArray<TemplateCardVM>;
  isLimitReached: boolean;
  limitReachedMessage: string;
  pendingDelete: { id: PlanTemplateId; message: string } | null;
  error: string | null;
};

// ============================================================================
// Helpers
// ============================================================================

function buildCards(templates: ReadonlyArray<PlanTemplateSummary>): TemplateCardVM[] {
  return domainSvc.sortTemplatesByRecency(templates).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    periodCountLabel: domainSvc.formatPeriodCountLabel(t.periodCount),
    updatedAt: t.updatedAt,
  }));
}

function computeLimitState(templateCount: number) {
  const decision = validationSvc.decideSaveTemplateLimit({
    currentCount: templateCount,
    maxTemplates: MAX_PLAN_TEMPLATES,
  });
  return matchSaveDecision(decision, {
    CanSave: () => ({ isLimitReached: false, limitReachedMessage: '' }),
    LimitReached: () => ({
      isLimitReached: true,
      limitReachedMessage: domainSvc.formatLimitReachedMessage(MAX_PLAN_TEMPLATES),
    }),
  });
}

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

const duplicateTemplateLogic = fromCallback<EventObject, { planTemplateId: PlanTemplateId }>(({ sendBack, input }) =>
  runWithUi(
    programDuplicateTemplate(input.planTemplateId),
    (result) => sendBack({ type: Event.ON_DUPLICATE_SUCCESS, result }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

const deleteTemplateLogic = fromCallback<EventObject, { planTemplateId: PlanTemplateId }>(({ sendBack, input }) =>
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
      const cards = buildCards(event.templates);
      return {
        templates: event.templates,
        cards,
        ...computeLimitState(event.templates.length),
        error: null,
      };
    }),
    addDuplicatedTemplate: assign(({ context, event }) => {
      assertEvent(event, Event.ON_DUPLICATE_SUCCESS);
      const summary: PlanTemplateSummary = {
        id: event.result.id,
        name: event.result.name,
        description: event.result.description,
        periodCount: event.result.periodCount,
        updatedAt: event.result.updatedAt,
      } as PlanTemplateSummary;
      const templates = [...context.templates, summary];
      return {
        templates,
        cards: buildCards(templates),
        ...computeLimitState(templates.length),
      };
    }),
    removeDeletedTemplate: assign(({ context, event }) => {
      assertEvent(event, Event.ON_DELETE_SUCCESS);
      const templates = context.templates.filter((t) => t.id !== event.planTemplateId);
      return {
        templates,
        cards: buildCards(templates),
        ...computeLimitState(templates.length),
        pendingDelete: null,
      };
    }),
    setPendingDelete: assign(({ event }) => {
      assertEvent(event, Event.REQUEST_DELETE);
      return {
        pendingDelete: {
          id: event.planTemplateId,
          message: domainSvc.buildDeleteConfirmationMessage(event.name),
        },
      };
    }),
    clearPendingDelete: assign(() => ({
      pendingDelete: null,
    })),
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
    canDuplicate: ({ context }) => !context.isLimitReached,
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
    cards: [],
    isLimitReached: false,
    limitReachedMessage: '',
    pendingDelete: null,
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
        [Event.REQUEST_DELETE]: {
          actions: ['setPendingDelete'],
        },
        [Event.CONFIRM_DELETE]: {
          target: PlanTemplatesState.Deleting,
        },
        [Event.CANCEL_DELETE]: {
          actions: ['clearPendingDelete'],
        },
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
        input: ({ context }) => {
          return { planTemplateId: context.pendingDelete!.id };
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
