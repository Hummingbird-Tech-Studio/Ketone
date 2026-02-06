import {
  BAR_BORDER_RADIUS,
  BAR_PADDING_HORIZONTAL,
  BAR_PADDING_TOP,
  getDayLabelWidth,
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from '../../constants';
import type { TimelineBar } from '../../types';

export interface BarGeometryInput {
  dayIndex: number;
  startHour: number;
  endHour: number;
  periodIndex: number;
  barData: TimelineBar;
  allBars: TimelineBar[];
  chartWidth: number;
}

export interface BarGeometry {
  // Dimensions
  barX: number;
  barY: number;
  barWidth: number;
  finalWidth: number;

  // Connection state (needed for drag handles in edit mode)
  hasConnectingBarBefore: boolean;
  hasConnectingBarAfter: boolean;
  hasConnectingBarBeforeSameDay: boolean;

  // Border radius: [top-left, top-right, bottom-right, bottom-left]
  borderRadius: [number, number, number, number];

  // Grid dimensions (useful for other calculations)
  dayLabelWidth: number;
  gridWidth: number;
}

/**
 * Calculates the geometry for rendering a timeline bar, including:
 * - Position and dimensions
 * - Connection state (for continuous bars spanning days)
 * - Border radius (rounded corners only on non-connected edges)
 *
 * This function is shared between view and edit modes to ensure consistent rendering.
 */
export function calculateBarGeometry(input: BarGeometryInput): BarGeometry {
  const { dayIndex, startHour, endHour, periodIndex, barData, allBars, chartWidth } = input;

  const dayLabelWidth = getDayLabelWidth(chartWidth);
  const gridWidth = chartWidth - dayLabelWidth;

  // Check for connecting bar on the same day
  const hasConnectingBarBeforeSameDay = allBars.some(
    (bar) =>
      bar.periodIndex === periodIndex &&
      bar.dayIndex === dayIndex &&
      Math.abs(bar.endHour - startHour) < 0.01 &&
      bar !== barData,
  );
  const hasConnectingBarAfterSameDay = allBars.some(
    (bar) =>
      bar.periodIndex === periodIndex &&
      bar.dayIndex === dayIndex &&
      Math.abs(bar.startHour - endHour) < 0.01 &&
      bar !== barData,
  );

  // Check for continuation from previous/next day
  const continuesFromPreviousDay = allBars.some((bar) => bar.dayIndex === dayIndex - 1 && bar.endHour > 23.99);
  const continuesToNextDay = allBars.some((bar) => bar.dayIndex === dayIndex + 1 && bar.startHour < 0.5);

  // Check if this bar is the leftmost/rightmost on its day
  const isLeftmostOnDay = !allBars.some((bar) => bar.dayIndex === dayIndex && bar.startHour < startHour - 0.01);
  const isRightmostOnDay = !allBars.some((bar) => bar.dayIndex === dayIndex && bar.endHour > endHour + 0.01);

  // Bar should extend to left edge if it's leftmost and either:
  // - starts very close to 0, OR
  // - there's a bar on the previous day that ends at 24 (continuation)
  const shouldExtendToLeftEdge = isLeftmostOnDay && (startHour < 0.5 || continuesFromPreviousDay);
  const shouldExtendToRightEdge = isRightmostOnDay && (endHour > 23.5 || continuesToNextDay);

  const hasConnectingBarBefore = hasConnectingBarBeforeSameDay || shouldExtendToLeftEdge;
  const hasConnectingBarAfter = hasConnectingBarAfterSameDay || shouldExtendToRightEdge;

  // Calculate padding - no padding on sides that connect to another bar or extend to grid edges
  const leftPadding = hasConnectingBarBefore ? 0 : BAR_PADDING_HORIZONTAL;
  const rightPadding = hasConnectingBarAfter ? 0 : BAR_PADDING_HORIZONTAL;

  // Calculate effective start/end hours - snap to edge when extending to grid edge
  const effectiveStartHour = shouldExtendToLeftEdge ? 0 : startHour;
  const effectiveEndHour = shouldExtendToRightEdge ? 24 : endHour;

  // Calculate bar dimensions
  const barX = dayLabelWidth + (effectiveStartHour / 24) * gridWidth + leftPadding;
  const barWidth = ((effectiveEndHour - effectiveStartHour) / 24) * gridWidth - leftPadding - rightPadding;
  const barY = HEADER_HEIGHT + dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

  const finalWidth = Math.max(barWidth, 2);

  // Calculate border radius - only round corners that don't connect to another bar or extend to grid edges
  const leftRadius = hasConnectingBarBefore ? 0 : BAR_BORDER_RADIUS;
  const rightRadius = hasConnectingBarAfter ? 0 : BAR_BORDER_RADIUS;

  // Border radius: [top-left, top-right, bottom-right, bottom-left]
  const borderRadius: [number, number, number, number] = [leftRadius, rightRadius, rightRadius, leftRadius];

  return {
    barX,
    barY,
    barWidth,
    finalWidth,
    hasConnectingBarBefore,
    hasConnectingBarAfter,
    hasConnectingBarBeforeSameDay,
    borderRadius,
    dayLabelWidth,
    gridWidth,
  };
}
