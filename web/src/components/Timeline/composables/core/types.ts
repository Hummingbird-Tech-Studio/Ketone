import type {
  echarts,
  ECOption,
  RenderItemAPI,
  RenderItemParams,
  RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import type { Ref, ShallowRef } from 'vue';

// ============================================================================
// Render Context (shared between modes)
// ============================================================================

/**
 * Context passed to render functions containing chart dimensions and data.
 */
export interface RenderContext {
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
}

/**
 * Parsed day label with separate day name and number for rendering.
 */
export interface ParsedDayLabel {
  dayName: string | undefined;
  dayNum: string | undefined;
}

// ============================================================================
// Chart Base Types
// ============================================================================

/**
 * Options for initializing the chart base.
 */
export interface ChartBaseOptions {
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  onResize?: () => void;
}

/**
 * Result returned by useChartBase.
 */
export interface ChartBaseResult {
  chartInstance: ShallowRef<echarts.ECharts | null>;
  chartHeight: Ref<number>;
  parsedDayLabels: Ref<ParsedDayLabel[]>;
  initChart: (options: ECOption) => void;
  refresh: (buildOptions: () => ECOption) => void;
}

// ============================================================================
// Render Function Types
// ============================================================================

export type { RenderItemAPI, RenderItemParams, RenderItemReturn };
