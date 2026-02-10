/**
 * Plan Templates List Composable (View Model)
 *
 * Thin mapper: reads pre-computed view models from actor context.
 * No domain logic, no FC imports — all computations live in the actor.
 */
import type { PlanTemplateId } from '@/views/planTemplates/domain';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Event, planTemplatesMachine, PlanTemplatesState } from '../actors/planTemplates.actor';

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

  // Context data — pre-computed by actor via FC services
  const cards = useSelector(actorRef, (state) => state.context.cards);
  const templates = useSelector(actorRef, (state) => state.context.templates);
  const isLimitReached = useSelector(actorRef, (state) => state.context.isLimitReached);
  const limitReachedMessage = useSelector(actorRef, (state) => state.context.limitReachedMessage);
  const pendingDelete = useSelector(actorRef, (state) => state.context.pendingDelete);
  const error = useSelector(actorRef, (state) => state.context.error);

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

    // Context data (pre-computed by actor)
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
