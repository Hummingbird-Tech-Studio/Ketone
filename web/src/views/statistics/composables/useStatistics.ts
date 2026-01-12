import type { PeriodType } from '@ketone/shared';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';
import { Event, statisticsMachine, StatisticsState } from '../actors/statistics.actor';

/**
 * Composable for accessing statistics state and actions
 *
 * @example
 * ```ts
 * const { loading, loaded, statistics, selectedPeriod, loadStatistics, changePeriod } = useStatistics();
 * ```
 */
export function useStatistics() {
  const { send, actorRef } = useActor(statisticsMachine);

  // State checks
  const idle = useSelector(actorRef, (state) => state.matches(StatisticsState.Idle));
  const loading = useSelector(actorRef, (state) => state.matches(StatisticsState.Loading));
  const loaded = useSelector(actorRef, (state) => state.matches(StatisticsState.Loaded));
  const error = useSelector(actorRef, (state) => state.matches(StatisticsState.Error));

  // Context data
  const statistics = useSelector(actorRef, (state) => state.context.statistics);
  const selectedPeriod = useSelector(actorRef, (state) => state.context.selectedPeriod);
  const errorMessage = useSelector(actorRef, (state) => state.context.error);

  // UI helpers
  const showSkeleton = computed(() => loading.value);

  // Actions
  const loadStatistics = () => {
    send({ type: Event.LOAD });
  };

  const refreshStatistics = () => {
    send({ type: Event.REFRESH });
  };

  const changePeriod = (period: PeriodType) => {
    send({ type: Event.CHANGE_PERIOD, period });
  };

  const nextPeriod = () => {
    send({ type: Event.NEXT_PERIOD });
  };

  const previousPeriod = () => {
    send({ type: Event.PREVIOUS_PERIOD });
  };

  return {
    // State checks
    idle,
    loading,
    loaded,
    error,
    // Context data
    statistics,
    selectedPeriod,
    errorMessage,
    // UI helpers
    showSkeleton,
    // Actions
    loadStatistics,
    refreshStatistics,
    changePeriod,
    nextPeriod,
    previousPeriod,
    // Actor ref
    actorRef,
  };
}
