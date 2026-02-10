/**
 * Plan Template Edit Composable (View Model)
 *
 * Thin mapper: actor selectors + actions that receive pre-validated domain input.
 * No validation logic — that lives in useTemplateEditForm (Input Shell).
 */
import type { PlanTemplateId } from '@/views/planTemplates/domain';
import { useActor, useSelector } from '@xstate/vue';
import {
  Event,
  planTemplateEditMachine,
  PlanTemplateEditState,
  type UpdateInput,
} from '../actors/planTemplateEdit.actor';

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

  // Actions
  const loadTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.LOAD, planTemplateId });
  };

  const submitUpdate = (input: UpdateInput) => {
    send({ type: Event.UPDATE, input });
  };

  const retry = () => {
    send({ type: Event.RETRY });
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

    // Actions
    loadTemplate,
    submitUpdate,
    retry,

    // Actor ref (for emissions)
    actorRef,
  };
}
