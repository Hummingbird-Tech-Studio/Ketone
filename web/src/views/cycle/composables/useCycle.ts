import { cycleMachine, CycleState, Event } from '@/views/cycle/actors/cycle.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing cycle state and actions
 *
 * @example
 * ```ts
 * const { loading, inProgress, cycleData, loadActiveCycle } = useCycle();
 * ```
 */
export function useCycle() {
  const { send, actorRef } = useActor(cycleMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(CycleState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(CycleState.Loading));
  const inProgress = useSelector(actorRef, (state) => state.matches(CycleState.InProgress));
  const finishing = useSelector(actorRef, (state) => state.matches(CycleState.Finishing));
  const completed = useSelector(actorRef, (state) => state.matches(CycleState.Completed));

  // Context data
  const cycleData = useSelector(actorRef, (state) => state.context.cycleData);

  const startDate = computed(() => cycleData.value?.startDate ?? new Date());
  const endDate = computed(() => cycleData.value?.endDate ?? new Date());

  // UI helpers - Show skeleton only on initial load (loading && no cycle data yet)
  const showSkeleton = computed(() => loading.value && cycleData.value === null);

  // Actions
  const loadActiveCycle = () => {
    send({
      type: Event.LOAD,
    });
  };

  return {
    // State checks
    idle,
    loading,
    inProgress,
    finishing,
    completed,
    // Context data
    cycleData,
    startDate,
    endDate,
    // UI helpers
    showSkeleton,
    // Actions
    loadActiveCycle,
    // Actor ref
    actorRef,
  };
}
