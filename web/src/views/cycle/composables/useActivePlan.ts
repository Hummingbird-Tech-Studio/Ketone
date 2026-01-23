import { activePlanMachine, ActivePlanState, Event } from '@/views/cycle/actors/activePlan.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing active plan state and actions
 *
 * @example
 * ```ts
 * const {
 *   loading,
 *   idle,
 *   inFastingWindow,
 *   inEatingWindow,
 *   periodCompleted,
 *   allPeriodsCompleted,
 *   activePlan,
 *   currentPeriod,
 *   windowPhase,
 *   refresh,
 *   actorRef,
 * } = useActivePlan();
 * ```
 */
export function useActivePlan() {
  const { send, actorRef } = useActor(activePlanMachine);

  // State checks
  const loading = useSelector(actorRef, (state) => state.matches(ActivePlanState.Loading));
  const idle = useSelector(actorRef, (state) => state.matches(ActivePlanState.Idle));
  const inFastingWindow = useSelector(actorRef, (state) => state.matches(ActivePlanState.InFastingWindow));
  const inEatingWindow = useSelector(actorRef, (state) => state.matches(ActivePlanState.InEatingWindow));
  const periodCompleted = useSelector(actorRef, (state) => state.matches(ActivePlanState.PeriodCompleted));
  const completingPlan = useSelector(actorRef, (state) => state.matches(ActivePlanState.CompletingPlan));
  const completePlanError = useSelector(actorRef, (state) => state.matches(ActivePlanState.CompletePlanError));
  const allPeriodsCompleted = useSelector(actorRef, (state) => state.matches(ActivePlanState.AllPeriodsCompleted));

  // Context data
  const activePlan = useSelector(actorRef, (state) => state.context.activePlan);
  const currentPeriod = useSelector(actorRef, (state) => state.context.currentPeriod);
  const windowPhase = useSelector(actorRef, (state) => state.context.windowPhase);
  const completeErrorMessage = useSelector(actorRef, (state) => state.context.completeError);

  // UI helpers
  const showSkeleton = computed(() => loading.value);
  const isActive = computed(() => inFastingWindow.value || inEatingWindow.value);

  // Computed properties for period info
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
  const refresh = () => {
    send({ type: Event.REFRESH });
  };

  const retryComplete = () => {
    send({ type: Event.RETRY_COMPLETE });
  };

  return {
    // State checks
    loading,
    idle,
    inFastingWindow,
    inEatingWindow,
    periodCompleted,
    completingPlan,
    completePlanError,
    allPeriodsCompleted,

    // Context data
    activePlan,
    currentPeriod,
    windowPhase,
    completeErrorMessage,

    // UI helpers
    showSkeleton,
    isActive,

    // Computed plan data
    completedPeriodsCount,
    totalPeriodsCount,

    // Actions
    refresh,
    retryComplete,

    // Actor ref (for advanced usage like listening to emits)
    actorRef,
  };
}
