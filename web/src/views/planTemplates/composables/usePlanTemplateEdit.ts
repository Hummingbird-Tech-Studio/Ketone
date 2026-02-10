/**
 * Plan Template Edit Composable (View Model)
 *
 * Exposes FC services as computeds, actor state, input validation, and actions.
 * Only layer for domain → UI translation.
 */
import {
  extractSchemaErrors,
  formatPeriodCountLabel,
  MAX_PLAN_DESCRIPTION_LENGTH,
  validateUpdateTemplateInput,
  type PlanTemplateId,
} from '@/views/planTemplates/domain';
import { useActor, useSelector } from '@xstate/vue';
import { Either } from 'effect';
import { computed, ref } from 'vue';
import { Event, planTemplateEditMachine, PlanTemplateEditState } from '../actors/planTemplateEdit.actor';

export function usePlanTemplateEdit() {
  const { send, actorRef } = useActor(planTemplateEditMachine);

  // State checks
  const loading = useSelector(
    actorRef,
    (state) => state.matches(PlanTemplateEditState.Idle) || state.matches(PlanTemplateEditState.Loading),
  );
  const ready = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.Ready));
  const updating = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.Updating));
  const hasError = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.Error));

  // Context data
  const template = useSelector(actorRef, (state) => state.context.template);
  const error = useSelector(actorRef, (state) => state.context.error);

  // Validation errors
  const validationErrors = ref<Record<string, string[]>>({});

  // FC computeds — domain → UI translation
  const periodCountLabel = computed(() => (template.value ? formatPeriodCountLabel(template.value.periodCount) : ''));

  // Actions
  const loadTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.LOAD, planTemplateId });
  };

  const updateTemplate = (rawInput: {
    name: string;
    description: string;
    periods: ReadonlyArray<{ fastingDuration: number; eatingWindow: number }>;
  }) => {
    // Check this
    const result = validateUpdateTemplateInput(rawInput);

    if (Either.isLeft(result)) {
      validationErrors.value = extractSchemaErrors(result.left);
      return;
    }

    validationErrors.value = {};
    send({ type: Event.UPDATE, input: result.right });
  };

  const retry = () => {
    send({ type: Event.RETRY });
  };

  const clearValidationErrors = () => {
    validationErrors.value = {};
  };

  return {
    // State checks
    loading,
    ready,
    updating,
    hasError,

    // Context data
    template,
    error,

    // Validation
    validationErrors,
    clearValidationErrors,

    // FC computeds
    periodCountLabel,

    // Constants for UI
    maxDescriptionLength: MAX_PLAN_DESCRIPTION_LENGTH,

    // FC helpers
    formatPeriodCountLabel,

    // Actions
    loadTemplate,
    updateTemplate,
    retry,

    // Actor ref (for emissions)
    actorRef,
  };
}
