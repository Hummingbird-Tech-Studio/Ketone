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

  // Computed properties for current period info
  const currentPeriod = computed(() => {
    if (!activePlan.value) return null;
    const now = new Date();
    return activePlan.value.periods.find((p) => now >= p.startDate && now < p.endDate) ?? null;
  });

  const nextPeriod = computed(() => {
    if (!activePlan.value) return null;
    const now = new Date();
    const currentIndex = activePlan.value.periods.findIndex((p) => now >= p.startDate && now < p.endDate);
    if (currentIndex === -1) {
      // No current period, find first scheduled (starts in the future)
      return activePlan.value.periods.find((p) => now < p.startDate) ?? null;
    }
    return activePlan.value.periods[currentIndex + 1] ?? null;
  });

  const completedPeriodsCount = computed(() => {
    if (!activePlan.value) return 0;
    const now = new Date();
    return activePlan.value.periods.filter((p) => now >= p.endDate).length;
  });

  const totalPeriodsCount = computed(() => {
    if (!activePlan.value) return 0;
    return activePlan.value.periods.length;
  });

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

    // Computed plan data
    currentPeriod,
    nextPeriod,
    completedPeriodsCount,
    totalPeriodsCount,

    // Actions
    loadActivePlan,
    loadPlan,
    loadPlans,
    createPlan,
    cancelPlan,
    updatePlanPeriods,
    refresh,

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
