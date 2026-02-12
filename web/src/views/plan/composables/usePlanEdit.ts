import { validateCreateFromPlanInput } from '@/views/planTemplates/domain/schemas/create-from-plan-input.schema';
import { useActor, useSelector } from '@xstate/vue';
import { Either } from 'effect';
import { computed } from 'vue';
import { Event, planEditMachine, PlanEditState } from '../actors/planEdit.actor';
import { validateUpdateMetadataInput, type UpdateMetadataDomainInput } from '../domain/schemas/update-metadata-input.schema';
import { validateSaveTimelineInput, type SaveTimelineDomainInput } from '../domain/schemas/save-timeline-input.schema';

/**
 * Composable for accessing plan edit state and actions
 *
 * @example
 * ```ts
 * const {
 *   plan,
 *   lastCompletedCycle,
 *   loading,
 *   ready,
 *   savingName,
 *   savingDescription,
 *   savingTimeline,
 *   saving,
 *   error,
 *   loadPlan,
 *   updateName,
 *   updateDescription,
 *   updateStartDate,
 *   saveTimeline,
 *   actorRef,
 * } = usePlanEdit();
 * ```
 */
export function usePlanEdit() {
  const { send, actorRef } = useActor(planEditMachine);

  // State checks
  const loading = useSelector(
    actorRef,
    (state) => state.matches(PlanEditState.Idle) || state.matches(PlanEditState.Loading),
  );
  const ready = useSelector(actorRef, (state) => state.matches(PlanEditState.Ready));
  const savingName = useSelector(actorRef, (state) => state.matches(PlanEditState.UpdatingName));
  const savingDescription = useSelector(actorRef, (state) => state.matches(PlanEditState.UpdatingDescription));
  const savingStartDate = useSelector(actorRef, (state) => state.matches(PlanEditState.UpdatingStartDate));
  const savingPeriods = useSelector(actorRef, (state) => state.matches(PlanEditState.UpdatingPeriods));
  const savingTimelineState = useSelector(actorRef, (state) => state.matches(PlanEditState.SavingTimeline));
  const hasError = useSelector(actorRef, (state) => state.matches(PlanEditState.Error));

  const savingAsTemplate = useSelector(actorRef, (state) => state.matches(PlanEditState.SavingAsTemplate));

  const savingTimeline = computed(
    () => savingStartDate.value || savingPeriods.value || savingTimelineState.value,
  );
  const saving = computed(
    () => savingName.value || savingDescription.value || savingTimeline.value || savingAsTemplate.value,
  );

  // Context data
  const plan = useSelector(actorRef, (state) => state.context.plan);
  const lastCompletedCycle = useSelector(actorRef, (state) => state.context.lastCompletedCycle);
  const error = useSelector(actorRef, (state) => state.context.error);

  // Actions
  const loadPlan = (planId: string) => {
    send({ type: Event.LOAD, planId });
  };

  const updateName = (planId: string, name: string) => {
    const result = validateUpdateMetadataInput({ planId, name });
    if (Either.isLeft(result)) return;
    send({ type: Event.UPDATE_NAME, input: result.right });
  };

  const updateDescription = (planId: string, description: string) => {
    const result = validateUpdateMetadataInput({ planId, description });
    if (Either.isLeft(result)) return;
    send({ type: Event.UPDATE_DESCRIPTION, input: result.right });
  };

  const updateStartDate = (planId: string, startDate: Date) => {
    const result = validateUpdateMetadataInput({ planId, startDate });
    if (Either.isLeft(result)) return;
    send({ type: Event.UPDATE_START_DATE, input: result.right });
  };

  /**
   * Save timeline changes — validates input then delegates to application service
   * which uses FC decision ADT. The originalPlan from actor context is passed
   * automatically so the FC can compare current vs original.
   */
  const saveTimeline = (input: SaveTimelineDomainInput) => {
    send({ type: Event.SAVE_TIMELINE, input });
  };

  const saveAsTemplate = (planId: string) => {
    const result = validateCreateFromPlanInput({ planId });
    if (Either.isLeft(result)) return;
    send({ type: Event.SAVE_AS_TEMPLATE, planId: result.right.planId });
  };

  return {
    // State checks
    loading,
    ready,
    savingName,
    savingDescription,
    savingStartDate,
    savingPeriods,
    savingAsTemplate,
    savingTimeline,
    saving,
    hasError,

    // Context data
    plan,
    lastCompletedCycle,
    error,

    // Actions
    loadPlan,
    updateName,
    updateDescription,
    updateStartDate,
    saveTimeline,
    saveAsTemplate,

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
