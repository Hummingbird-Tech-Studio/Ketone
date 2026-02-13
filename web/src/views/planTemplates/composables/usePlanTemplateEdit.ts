/**
 * Plan Template Edit Composable (View Model)
 *
 * Thin mapper: actor selectors + actions that receive pre-validated domain input.
 * No validation logic — that lives in useTemplateEditForm (Input Shell).
 */
import type { PlanTemplateId, UpdateTemplateDomainInput } from '@/views/planTemplates/domain';
import { useActor, useSelector } from '@xstate/vue';
import { Event, planTemplateEditMachine, PlanTemplateEditState } from '../actors/planTemplateEdit.actor';

export function usePlanTemplateEdit() {
  const { send, actorRef } = useActor(planTemplateEditMachine);

  // State checks
  const loading = useSelector(
    actorRef,
    (state) => state.matches(PlanTemplateEditState.Idle) || state.matches(PlanTemplateEditState.Loading),
  );
  const ready = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.Ready));
  const updatingName = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.UpdatingName));
  const updatingDescription = useSelector(actorRef, (state) =>
    state.matches(PlanTemplateEditState.UpdatingDescription),
  );
  const updatingTimeline = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.UpdatingTimeline));
  const hasError = useSelector(actorRef, (state) => state.matches(PlanTemplateEditState.Error));

  // Context data
  const template = useSelector(actorRef, (state) => state.context.template);
  const error = useSelector(actorRef, (state) => state.context.error);

  // Actions
  const loadTemplate = (planTemplateId: PlanTemplateId) => {
    send({ type: Event.LOAD, planTemplateId });
  };

  const submitNameUpdate = (input: UpdateTemplateDomainInput) => {
    send({ type: Event.UPDATE_NAME, input });
  };

  const submitDescriptionUpdate = (input: UpdateTemplateDomainInput) => {
    send({ type: Event.UPDATE_DESCRIPTION, input });
  };

  const submitTimelineUpdate = (input: UpdateTemplateDomainInput) => {
    send({ type: Event.UPDATE_TIMELINE, input });
  };

  const retry = () => {
    send({ type: Event.RETRY });
  };

  return {
    // State checks
    loading,
    ready,
    updatingName,
    updatingDescription,
    updatingTimeline,
    hasError,

    // Context data
    template,
    error,

    // Actions
    loadTemplate,
    submitNameUpdate,
    submitDescriptionUpdate,
    submitTimelineUpdate,
    retry,

    // Actor ref (for emissions)
    actorRef,
  };
}
