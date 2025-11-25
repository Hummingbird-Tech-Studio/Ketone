import { statisticsMachine, StatisticsState, Event } from '../actors/statistics.actor';
import type { PeriodType } from '@ketone/shared';
import { useActor, useSelector } from '@xstate/vue';
import { computed } from 'vue';

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
  const showSkeleton = computed(() => loading.value && statistics.value === null);

  // Actions
  const loadStatistics = () => {
    send({ type: Event.LOAD });
  };

  const changePeriod = (period: PeriodType) => {
    send({ type: Event.CHANGE_PERIOD, period });
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
    changePeriod,
    // Actor ref
    actorRef,
  };
}
