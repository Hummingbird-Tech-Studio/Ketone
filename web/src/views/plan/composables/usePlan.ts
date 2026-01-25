import { Event, planMachine, PlanState } from '@/views/plan/actors/plan.actor';
import type { CreatePlanPayload, UpdatePeriodsPayload } from '@/views/plan/services/plan.service';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing plan state and actions
 *
 * @example
 * ```ts
 * const {
 *   idle,
 *   loading,
 *   hasActivePlan,
 *   noPlan,
 *   activePlan,
 *   plans,
 *   loadActivePlan,
 *   createPlan,
 *   cancelPlan,
 *   actorRef,
 * } = usePlan();
 * ```
 */
export function usePlan() {
  const { send, actorRef } = useActor(planMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(PlanState.Idle));
  const loadingActivePlan = useSelector(actorRef, (state) => state.matches(PlanState.LoadingActivePlan));
  const loadingPlan = useSelector(actorRef, (state) => state.matches(PlanState.LoadingPlan));
  const loadingPlans = useSelector(actorRef, (state) => state.matches(PlanState.LoadingPlans));
  const loadingLastCompletedCycle = useSelector(actorRef, (state) =>
    state.matches(PlanState.LoadingLastCompletedCycle),
  );
  const creating = useSelector(actorRef, (state) => state.matches(PlanState.Creating));
  const cancelling = useSelector(actorRef, (state) => state.matches(PlanState.Cancelling));
  const updatingPeriods = useSelector(actorRef, (state) => state.matches(PlanState.UpdatingPeriods));
  const hasActivePlan = useSelector(actorRef, (state) => state.matches(PlanState.HasActivePlan));
  const noPlan = useSelector(actorRef, (state) => state.matches(PlanState.NoPlan));

  // Combined loading state for UI
  const loading = computed(() => loadingActivePlan.value || loadingPlan.value || loadingPlans.value);
  const isActionLoading = computed(() => creating.value || cancelling.value || updatingPeriods.value);
  const showSkeleton = computed(() => loadingActivePlan.value);

  // Context data
  const activePlan = useSelector(actorRef, (state) => state.context.activePlan);
  const selectedPlan = useSelector(actorRef, (state) => state.context.selectedPlan);
  const plans = useSelector(actorRef, (state) => state.context.plans);
  const lastCompletedCycle = useSelector(actorRef, (state) => state.context.lastCompletedCycle);

  // Actions
  const loadActivePlan = () => {
    send({ type: Event.LOAD_ACTIVE_PLAN });
  };

  const loadPlan = (planId: string) => {
    send({ type: Event.LOAD_PLAN, planId });
  };

  const loadPlans = () => {
    send({ type: Event.LOAD_PLANS });
  };

  const loadLastCompletedCycle = () => {
    send({ type: Event.LOAD_LAST_COMPLETED_CYCLE });
  };

  const createPlan = (payload: CreatePlanPayload) => {
    send({ type: Event.CREATE, payload });
  };

  const cancelPlan = (planId: string) => {
    send({ type: Event.CANCEL, planId });
  };

  const updatePlanPeriods = (planId: string, payload: UpdatePeriodsPayload) => {
    send({ type: Event.UPDATE_PERIODS, planId, payload });
  };

  const refresh = () => {
    send({ type: Event.REFRESH });
  };

  return {
    // State checks
    idle,
    loading,
    loadingActivePlan,
    loadingPlan,
    loadingPlans,
    loadingLastCompletedCycle,
    creating,
    cancelling,
    updatingPeriods,
    isActionLoading,
    hasActivePlan,
    noPlan,
    showSkeleton,

    // Context data
    activePlan,
    selectedPlan,
    plans,
    lastCompletedCycle,

    // Actions
    loadActivePlan,
    loadPlan,
    loadPlans,
    loadLastCompletedCycle,
    createPlan,
    cancelPlan,
    updatePlanPeriods,
    refresh,

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
