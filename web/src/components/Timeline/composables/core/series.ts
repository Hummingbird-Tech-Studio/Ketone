import type { Ref } from 'vue';
import type { CurrentTimePosition } from '../../types';
import { createRenderGridBackground, createRenderHourLabels } from './renderers';
import type { ParsedDayLabel, RenderItemAPI, RenderItemParams, RenderItemReturn } from './types';

// ============================================================================
// Data Transformations
// ============================================================================

/**
 * Build marker data from current time position.
 */
export function buildMarkerData(currentTimePosition: Ref<CurrentTimePosition | null>): { value: [number, number] }[] {
  const pos = currentTimePosition.value;
  if (!pos) return [{ value: [-1, -1] }]; // Invalid position that won't render
  return [{ value: [pos.dayIndex, pos.hourPosition] }];
}

// ============================================================================
// Base Series Builder
// ============================================================================

export interface BaseSeriesOptions {
  numRows: Ref<number>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  parsedDayLabels: Ref<ParsedDayLabel[]>;
}

export interface BaseSeries {
  renderHourLabels: (params: RenderItemParams, api: RenderItemAPI) => RenderItemReturn;
  renderGridBackground: (params: RenderItemParams) => RenderItemReturn;
}

/**
 * Build base render functions that are shared between view and edit modes.
 * Returns render functions for series 0 (hour labels) and series 1 (grid background).
 */
export function buildBaseSeries(options: BaseSeriesOptions): BaseSeries {
  const { numRows, hourLabels, hourPositions, parsedDayLabels } = options;

  // Create render functions
  const renderHourLabels = createRenderHourLabels(hourLabels, hourPositions);
  const renderGridBackground = createRenderGridBackground(numRows, parsedDayLabels);

  return {
    renderHourLabels,
    renderGridBackground,
  };
}
