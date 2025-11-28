import { calculateFastingTime, formatShortDateTime } from '@/utils/formatting';
import { cycleDetailMachine, CycleDetailState, Event } from '@/views/cycleDetail/actors/cycleDetail.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing cycle detail state and actions
 *
 * @example
 * ```ts
 * const { loading, cycle, totalFastingTime, loadCycle, requestStartDateChange, requestEndDateChange } = useCycleDetail(cycleId);
 * ```
 */
export function useCycleDetail(cycleId: string) {
  const { send, actorRef } = useActor(cycleDetailMachine, { input: { cycleId } });

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(CycleDetailState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(CycleDetailState.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches(CycleDetailState.Loaded));
  const updating = useSelector(actorRef, (state) => state.matches(CycleDetailState.Updating));
  const error = useSelector(actorRef, (state) => state.matches(CycleDetailState.Error));

  // Context data
  const cycle = useSelector(actorRef, (state) => state.context.cycle);
  const errorMessage = useSelector(actorRef, (state) => state.context.error);

  // Computed helpers
  const isCompleted = computed(() => cycle.value?.status === 'Completed');
  const isInProgress = computed(() => cycle.value?.status === 'InProgress');

  const startDate = computed(() => (cycle.value ? formatShortDateTime(cycle.value.startDate) : ''));
  const endDate = computed(() => (cycle.value ? formatShortDateTime(cycle.value.endDate) : ''));

  const totalFastingTime = computed(() => {
    if (!cycle.value) return '';
    const end = cycle.value.status === 'InProgress' ? new Date() : cycle.value.endDate;
    return calculateFastingTime(cycle.value.startDate, end);
  });

  // Actions
  const loadCycle = () => {
    send({ type: Event.LOAD });
  };

  // Validated date change actions (with overlap and range validation)
  const requestStartDateChange = (newStartDate: Date) => {
    send({ type: Event.REQUEST_START_CHANGE, date: newStartDate });
  };

  const requestEndDateChange = (newEndDate: Date) => {
    send({ type: Event.REQUEST_END_CHANGE, date: newEndDate });
  };

  return {
    // State checks
    idle,
    loading,
    loaded,
    updating,
    error,
    // Context data
    cycle,
    errorMessage,
    startDate,
    endDate,
    // Computed helpers
    isCompleted,
    isInProgress,
    totalFastingTime,
    // Actions
    loadCycle,
    requestStartDateChange,
    requestEndDateChange,
    // Actor ref
    actorRef,
  };
}
