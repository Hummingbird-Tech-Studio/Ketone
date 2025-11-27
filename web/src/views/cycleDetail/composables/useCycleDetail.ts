import { calculateFastingTime, formatDate, formatHour, formatShortDateTime } from '@/utils/formatting';
import { cycleDetailMachine, CycleDetailState, Event } from '@/views/cycleDetail/actors/cycleDetail.actor';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

/**
 * Composable for accessing cycle detail state and actions
 *
 * @example
 * ```ts
 * const { loading, loaded, cycle, formattedDate, totalFastingTime, loadCycle, updateDates } = useCycleDetail(cycleId);
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

  const formattedDateRange = computed(() => {
    if (!cycle.value) return '';

    const start = cycle.value.startDate;
    const end = cycle.value.endDate;

    const startDateStr = formatDate(start);
    const startHourStr = formatHour(start);
    const endDateStr = formatDate(end);
    const endHourStr = formatHour(end);

    // If same day, show: "Mon, Jan 1 · 10:00 AM - 6:00 PM"
    if (startDateStr === endDateStr) {
      return `${startDateStr} · ${startHourStr} - ${endHourStr}`;
    }

    // If different days, show: "Mon, Jan 1 10:00 AM - Tue, Jan 2 6:00 PM"
    return `${startDateStr} ${startHourStr} - ${endDateStr} ${endHourStr}`;
  });

  const totalFastingTime = computed(() => {
    if (!cycle.value) return '';
    const end = cycle.value.status === 'InProgress' ? new Date() : cycle.value.endDate;
    return calculateFastingTime(cycle.value.startDate, end);
  });

  // Actions
  const loadCycle = () => {
    send({ type: Event.LOAD });
  };

  const updateDates = (newStartDate: Date, newEndDate: Date) => {
    send({ type: Event.UPDATE_DATES, startDate: newStartDate, endDate: newEndDate });
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
    formattedDateRange,
    totalFastingTime,
    // Actions
    loadCycle,
    updateDates,
    // Actor ref
    actorRef,
  };
}
