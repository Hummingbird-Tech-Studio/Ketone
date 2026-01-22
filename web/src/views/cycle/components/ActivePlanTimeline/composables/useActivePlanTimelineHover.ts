import { computed, ref } from 'vue';

/**
 * Simplified hover-only state management for the active plan timeline.
 * No drag functionality - just hover states for period highlighting.
 */
export function useActivePlanTimelineHover() {
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
