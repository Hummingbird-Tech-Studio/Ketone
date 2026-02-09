/**
 * Plan Templates List Composable (View Model)
 *
 * Exposes FC services as computeds, actor state, and validated actions.
 * Only layer for domain → UI translation.
 */
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import {
  Event,
  planTemplatesMachine,
  PlanTemplatesState,
} from '../actors/planTemplates.actor';
import {
  MAX_PLAN_TEMPLATES,
  type PlanTemplateId,
} from '../domain/plan-template.model';
import { isTemplateLimitReached } from '../domain/services/plan-template-validation.service';
import {
  sortTemplatesByRecency,
  formatPeriodCountLabel,
  buildDeleteConfirmationMessage,
} from '../domain/services/plan-template.service';

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

  // Context data
  const templates = useSelector(actorRef, (state) => state.context.templates);
  const error = useSelector(actorRef, (state) => state.context.error);

  // FC computeds — domain → UI translation
  const sortedTemplates = computed(() => sortTemplatesByRecency(templates.value));

  const isLimitReached = computed(() =>
    isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES),
  );

  const emptyStateVisible = computed(() =>
    ready.value && templates.value.length === 0,
  );

  const limitReachedMessage = computed(() =>
    `You have ${MAX_PLAN_TEMPLATES} saved plans\u2014that's the limit! To save a new one, delete a plan you no longer use.`,
  );

  // Actions
  const loadTemplates = () => {
    send({ type: Event.LOAD });
  };

  const duplicateTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.DUPLICATE, planTemplateId });
  };

  const deleteTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.DELETE, planTemplateId });
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

    // Context data
    templates,
    error,

    // FC computeds
    sortedTemplates,
    isLimitReached,
    emptyStateVisible,
    limitReachedMessage,

    // FC helpers (exposed for component use)
    formatPeriodCountLabel,
    buildDeleteConfirmationMessage,

    // Actions
    loadTemplates,
    duplicateTemplate,
    deleteTemplate,
    retry,

    // Actor ref (for emissions)
    actorRef,
  };
}
