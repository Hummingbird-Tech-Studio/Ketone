import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Event, planEditMachine, PlanEditState, type PeriodUpdateInput } from '../actors/planEdit.actor';

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
 *   savingStartDate,
 *   savingPeriods,
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
  const hasError = useSelector(actorRef, (state) => state.matches(PlanEditState.Error));

  const savingTimeline = computed(() => savingStartDate.value || savingPeriods.value);
  const saving = computed(
    () => savingName.value || savingDescription.value || savingStartDate.value || savingPeriods.value,
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
    send({ type: Event.UPDATE_NAME, planId, name });
  };

  const updateDescription = (planId: string, description: string) => {
    send({ type: Event.UPDATE_DESCRIPTION, planId, description });
  };

  const updateStartDate = (planId: string, startDate: Date) => {
    send({ type: Event.UPDATE_START_DATE, planId, startDate });
  };

  /**
   * Save timeline changes - handles sequencing of startDate and periods updates
   * @param planId - The plan ID
   * @param startDate - New start date (if changed)
   * @param periods - Period updates (if changed)
   */
  const saveTimeline = (planId: string, startDate?: Date, periods?: PeriodUpdateInput[]) => {
    send({ type: Event.SAVE_TIMELINE, planId, startDate, periods });
  };

  return {
    // State checks
    loading,
    ready,
    savingName,
    savingDescription,
    savingStartDate,
    savingPeriods,
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

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
