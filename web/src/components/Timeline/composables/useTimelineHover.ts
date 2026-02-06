import { computed, ref } from 'vue';

/**
 * Simple hover state management for timeline period highlighting.
 * Used in view mode (no drag functionality).
 */
export function useTimelineHover() {
  const hoveredPeriodIndex = ref(-1);

  const hasActiveHover = computed(() => hoveredPeriodIndex.value !== -1);

  const hoverPeriod = (periodIndex: number) => {
    hoveredPeriodIndex.value = periodIndex;
  };

  const hoverExit = () => {
    hoveredPeriodIndex.value = -1;
  };

  return {
    hoveredPeriodIndex,
    hasActiveHover,
    hoverPeriod,
    hoverExit,
  };
}
