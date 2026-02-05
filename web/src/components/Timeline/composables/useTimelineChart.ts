import type { Ref } from 'vue';
import type { UseTimelineChartEditOptions, UseTimelineChartOptions, UseTimelineChartViewOptions } from '../types';
import { useTimelineChartEdit } from './useTimelineChartEdit';
import { useTimelineChartView } from './useTimelineChartView';

// ============================================================================
// Factory Composable
// ============================================================================

/**
 * Factory composable for the Timeline chart.
 *
 * Delegates to mode-specific implementations:
 * - View mode: Simple read-only display with hover highlighting
 * - Edit mode: Full drag-to-resize functionality with touch support
 *
 * Uses discriminated union types to ensure type safety based on mode.
 */
export function useTimelineChart(chartContainer: Ref<HTMLElement | null>, options: UseTimelineChartOptions) {
  if (options.mode === 'edit') {
    return useTimelineChartEdit(chartContainer, options as UseTimelineChartEditOptions);
  }
  return useTimelineChartView(chartContainer, options as UseTimelineChartViewOptions);
}

// Re-export types for convenience
export type { UseTimelineChartEditOptions, UseTimelineChartOptions, UseTimelineChartViewOptions };
