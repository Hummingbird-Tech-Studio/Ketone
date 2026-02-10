/**
 * Plan Templates List Composable (View Model)
 *
 * Derives all view-model state from raw actor context via FC service functions.
 * Actor stores domain data only — presentation logic lives here (dm-design-web Rule 13).
 */
import { MAX_PLAN_TEMPLATES, type PlanTemplateId } from '@/views/planTemplates/domain';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Event, planTemplatesMachine, PlanTemplatesState } from '../actors/planTemplates.actor';
import {
  buildDeleteConfirmationMessage,
  formatLimitReachedMessage,
  formatPeriodCountLabel,
  sortTemplatesByRecency,
} from '../utils/plan-template-formatting';

export type TemplateCardVM = {
  id: PlanTemplateId;
  name: string;
  description: string | null;
  periodCountLabel: string;
  updatedAt: Date;
};

export function usePlanTemplates() {
  const { send, actorRef } = useActor(planTemplatesMachine);

  // State checks
  const loading = useSelector(
    actorRef,
    (state) => state.matches(PlanTemplatesState.Idle) || state.matches(PlanTemplatesState.Loading),
  );
  const ready = useSelector(actorRef, (state) => state.matches(PlanTemplatesState.Ready));
  const duplicating = useSelector(actorRef, (state) => state.matches(PlanTemplatesState.Duplicating));
  const deleting = useSelector(actorRef, (state) => state.matches(PlanTemplatesState.Deleting));
  const hasError = useSelector(actorRef, (state) => state.matches(PlanTemplatesState.Error));

  // Raw domain data from actor
  const templates = useSelector(actorRef, (state) => state.context.templates);
  const pendingDeleteRaw = useSelector(actorRef, (state) => state.context.pendingDelete);
  const error = useSelector(actorRef, (state) => state.context.error);

  // View-model computeds (derived via FC functions)
  const cards = computed<ReadonlyArray<TemplateCardVM>>(() =>
    sortTemplatesByRecency(templates.value).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      periodCountLabel: formatPeriodCountLabel(t.periodCount),
      updatedAt: t.updatedAt,
    })),
  );

  const isLimitReached = computed(() => templates.value.length >= MAX_PLAN_TEMPLATES);

  const limitReachedMessage = computed(() =>
    isLimitReached.value ? formatLimitReachedMessage(MAX_PLAN_TEMPLATES) : '',
  );

  const pendingDelete = computed(() =>
    pendingDeleteRaw.value
      ? { ...pendingDeleteRaw.value, message: buildDeleteConfirmationMessage(pendingDeleteRaw.value.name) }
      : null,
  );

  // Derived UI state
  const emptyStateVisible = computed(() => ready.value && cards.value.length === 0);

  // Actions
  const loadTemplates = () => {
    send({ type: Event.LOAD });
  };

  const duplicateTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.DUPLICATE, planTemplateId });
  };

  const requestDelete = (planTemplateId: PlanTemplateId, name: string) => {
    send({ type: Event.REQUEST_DELETE, planTemplateId, name });
  };

  const confirmDelete = () => {
    send({ type: Event.CONFIRM_DELETE });
  };

  const cancelDelete = () => {
    send({ type: Event.CANCEL_DELETE });
  };

  const retry = () => {
    send({ type: Event.RETRY });
  };

  return {
    // State checks
    loading,
    ready,
    duplicating,
    deleting,
    hasError,

    // View-model computeds
    cards,
    templates,
    isLimitReached,
    limitReachedMessage,
    pendingDelete,
    error,

    // Derived UI state
    emptyStateVisible,

    // Actions
    loadTemplates,
    duplicateTemplate,
    requestDelete,
    confirmDelete,
    cancelDelete,
    retry,

    // Actor ref (for emissions)
    actorRef,
  };
}
