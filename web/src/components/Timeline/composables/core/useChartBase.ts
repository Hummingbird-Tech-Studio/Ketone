import { useChartLifecycle } from '@/views/statistics/StatisticsChart/composables/chart/lifecycle';
import { echarts, type ECOption } from '@/views/statistics/StatisticsChart/composables/chart/types';
import { computed, shallowRef, type Ref, type ShallowRef } from 'vue';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../../constants';
import type { ParsedDayLabel } from './types';

// ============================================================================
// Types
// ============================================================================

export interface UseChartBaseOptions {
  chartContainer: Ref<HTMLElement | null>;
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  buildChartOptions: () => ECOption;
  onResize?: () => void;
}

export interface UseChartBaseResult {
  chartInstance: ShallowRef<echarts.ECharts | null>;
  chartHeight: Ref<number>;
  parsedDayLabels: Ref<ParsedDayLabel[]>;
  refresh: () => void;
  initChart: () => void;
}

// ============================================================================
// Composable
// ============================================================================

/**
 * Base chart setup shared between view and edit modes.
 * Handles chart initialization, lifecycle, resize, and common computed values.
 */
export function useChartBase(options: UseChartBaseOptions): UseChartBaseResult {
  const { chartContainer, numRows, dayLabels, buildChartOptions, onResize } = options;

  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // ========================================
  // Computed Properties
  // ========================================

  /**
   * Calculate total chart height based on number of rows.
   */
  const chartHeight = computed(() => {
    return HEADER_HEIGHT + numRows.value * ROW_HEIGHT;
  });

  /**
   * Parse day labels into separate day name and number for rendering.
   */
  const parsedDayLabels = computed<ParsedDayLabel[]>(() => {
    return dayLabels.value.map((label) => {
      const parts = label.split('\n');
      return { dayName: parts[0], dayNum: parts[1] };
    });
  });

  // ========================================
  // Chart Initialization
  // ========================================

  function initChart() {
    if (!chartContainer.value) return;

    // Dispose any existing chart on the container
    const existingChart = echarts.getInstanceByDom(chartContainer.value);
    if (existingChart) {
      existingChart.dispose();
    }

    chartInstance.value = echarts.init(chartContainer.value);
    chartInstance.value.setOption(buildChartOptions());
  }

  // ========================================
  // Lifecycle Setup
  // ========================================

  const { refresh } = useChartLifecycle({
    chartContainer,
    chartInstance,
    buildChartOptions,
    initChart,
    onResize,
  });

  return {
    chartInstance,
    chartHeight,
    parsedDayLabels,
    refresh,
    initChart,
  };
}
