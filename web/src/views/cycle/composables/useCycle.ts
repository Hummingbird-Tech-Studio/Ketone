import { cycleMachine, CycleState, Event } from '@/views/cycle/actors/cycle.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing cycle state and actions
 *
 * @example
 * ```ts
 * const { loading, inProgress, cycleMetadata, startDate, endDate, loadActiveCycle } = useCycle();
 * ```
 */
export function useCycle() {
  const { send, actorRef } = useActor(cycleMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(CycleState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(CycleState.Loading));
  const creating = useSelector(actorRef, (state) => state.matches(CycleState.Creating));
  const inProgress = useSelector(actorRef, (state) => state.matches(CycleState.InProgress));
  const updating = useSelector(actorRef, (state) => state.matches(CycleState.Updating));
  const confirmCompletion = useSelector(actorRef, (state) => state.matches(CycleState.ConfirmCompletion));
  const finishing = useSelector(actorRef, (state) => state.matches(CycleState.Finishing));
  const completed = useSelector(actorRef, (state) => state.matches(CycleState.Completed));

  // Context data
  const cycleMetadata = useSelector(actorRef, (state) => state.context.cycleMetadata);
  const initialDuration = useSelector(actorRef, (state) => state.context.initialDuration);
  const startDate = useSelector(actorRef, (state) => state.context.startDate);
  const endDate = useSelector(actorRef, (state) => state.context.endDate);

  const showSkeleton = computed(() => loading.value && cycleMetadata.value === null);

  // Actions
  const loadActiveCycle = () => {
    send({
      type: Event.LOAD,
    });
  };

  const createCycle = () => {
    send({
      type: Event.CREATE,
    });
  };

  return {
    // State checks
    idle,
    loading,
    creating,
    inProgress,
    updating,
    confirmCompletion,
    finishing,
    completed,
    // Context data
    cycleMetadata,
    initialDuration,
    startDate,
    endDate,
    // UI helpers
    showSkeleton,
    // Actions
    loadActiveCycle,
    createCycle,
    // Actor ref
    actorRef,
  };
}
