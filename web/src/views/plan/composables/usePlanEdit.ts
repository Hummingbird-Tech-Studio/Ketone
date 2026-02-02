import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Event, planEditMachine, PlanEditState } from '../actors/planEdit.actor';
import type { UpdatePeriodsPayload } from '../services/plan.service';

/**
 * Composable for accessing plan edit state and actions
 *
 * @example
 * ```ts
 * const {
 *   plan,
 *   lastCompletedCycle,
 *   loading,
 *   idle,
 *   savingName,
 *   savingDescription,
 *   savingStartDate,
 *   savingPeriods,
 *   error,
 *   loadPlan,
 *   updateName,
 *   updateDescription,
 *   updateStartDate,
 *   savePeriods,
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

  // Combined saving state
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

  const savePeriods = (planId: string, payload: UpdatePeriodsPayload) => {
    send({ type: Event.UPDATE_PERIODS, planId, payload });
  };

  return {
    // State checks
    loading,
    ready,
    savingName,
    savingDescription,
    savingStartDate,
    savingPeriods,
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
    savePeriods,

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
