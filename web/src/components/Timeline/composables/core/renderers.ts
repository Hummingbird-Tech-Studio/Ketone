import type { Ref } from 'vue';
import {
  BAR_HEIGHT,
  BAR_PADDING_TOP,
  COLOR_BORDER,
  COLOR_LOCATION_MARKER,
  COLOR_TEXT,
  getDayLabelWidth,
  GRID_BORDER_RADIUS,
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from '../../constants';
import type { ParsedDayLabel, RenderItemAPI, RenderItemParams, RenderItemReturn } from './types';

// ============================================================================
// Hour Labels Renderer
// ============================================================================

/**
 * Creates a render function for hour labels in the header.
 */
export function createRenderHourLabels(
  hourLabels: Ref<string[]>,
  hourPositions: Ref<number[]>,
): (params: RenderItemParams, api: RenderItemAPI) => RenderItemReturn {
  return (params: RenderItemParams, api: RenderItemAPI): RenderItemReturn => {
    const index = api.value(0);
    const hourLabel = hourLabels.value[index];
    const hourPosition = hourPositions.value[index];
    if (hourLabel === undefined || hourPosition === undefined) {
      return { type: 'group', children: [] };
    }

    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;
    const x = dayLabelWidth + (hourPosition / 24) * gridWidth;

    return {
      type: 'text',
      style: {
        text: hourLabel,
        x,
        y: HEADER_HEIGHT / 2,
        textAlign: 'left',
        textVerticalAlign: 'middle',
        fontSize: 11,
        fontWeight: 400,
        fill: COLOR_TEXT,
      },
    };
  };
}

// ============================================================================
// Grid Background Renderer
// ============================================================================

/**
 * Creates a render function for the grid background with day labels.
 */
export function createRenderGridBackground(
  numRows: Ref<number>,
  parsedDayLabels: Ref<ParsedDayLabel[]>,
): (params: RenderItemParams) => RenderItemReturn {
  return (params: RenderItemParams): RenderItemReturn => {
    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const rows = numRows.value;
    const gridWidth = chartWidth - dayLabelWidth;
    const gridHeight = rows * ROW_HEIGHT;

    const children: RenderItemReturn[] = [];

    // Day labels on the left
    for (let i = 0; i < rows; i++) {
      const labelData = parsedDayLabels.value[i];
      if (!labelData) continue;

      // Day name (e.g., "Thu")
      children.push({
        type: 'text',
        style: {
          text: labelData.dayName,
          x: dayLabelWidth / 2,
          y: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 - 7,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 11,
          fontWeight: 500,
          fill: COLOR_TEXT,
        },
      });

      // Day number (e.g., "8")
      children.push({
        type: 'text',
        style: {
          text: labelData.dayNum,
          x: dayLabelWidth / 2,
          y: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 7,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 13,
          fontWeight: 600,
          fill: COLOR_TEXT,
        },
      });
    }

    // Grid border
    children.push({
      type: 'rect',
      shape: {
        x: dayLabelWidth,
        y: HEADER_HEIGHT,
        width: gridWidth,
        height: gridHeight,
        r: GRID_BORDER_RADIUS,
      },
      style: {
        fill: 'transparent',
        stroke: COLOR_BORDER,
        lineWidth: 1,
      },
    });

    // Vertical dividers at 6-hour intervals
    const hourDividers = [6, 12, 18];
    hourDividers.forEach((hour) => {
      const x = dayLabelWidth + (hour / 24) * gridWidth;
      children.push({
        type: 'line',
        shape: {
          x1: x,
          y1: HEADER_HEIGHT,
          x2: x,
          y2: HEADER_HEIGHT + gridHeight,
        },
        style: {
          stroke: COLOR_BORDER,
          lineWidth: 1,
        },
      });
    });

    // Horizontal dividers between rows
    for (let i = 1; i < rows; i++) {
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      children.push({
        type: 'line',
        shape: {
          x1: dayLabelWidth,
          y1: y,
          x2: chartWidth,
          y2: y,
        },
        style: {
          stroke: COLOR_BORDER,
          lineWidth: 1,
        },
      });
    }

    return {
      type: 'group',
      children,
    };
  };
}

// ============================================================================
// Location Marker Renderer
// ============================================================================

/**
 * Render function for the location marker at current time position.
 * This is the same for both view and edit modes.
 */
export function renderLocationMarker(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
  const dayIndex = api.value(0);
  const hourPosition = api.value(1);

  // Skip rendering if position is invalid
  if (dayIndex < 0 || hourPosition < 0) {
    return { type: 'group', children: [] };
  }

  const chartWidth = params.coordSys.width;
  const dayLabelWidth = getDayLabelWidth(chartWidth);
  const gridWidth = chartWidth - dayLabelWidth;

  const x = dayLabelWidth + (hourPosition / 24) * gridWidth;
  const barY = HEADER_HEIGHT + dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

  // Draw a vertical line marker with a circle on top
  const children: RenderItemReturn[] = [
    // Vertical line through the bar
    {
      type: 'line',
      shape: {
        x1: x,
        y1: barY - 4,
        x2: x,
        y2: barY + BAR_HEIGHT + 4,
      },
      style: {
        stroke: COLOR_LOCATION_MARKER,
        lineWidth: 2,
      },
    },
    // Circle marker on top
    {
      type: 'rect',
      shape: {
        x: x - 6,
        y: barY - 10,
        width: 12,
        height: 12,
        r: 6,
      },
      style: {
        fill: COLOR_LOCATION_MARKER,
      },
    },
    // Inner white dot
    {
      type: 'rect',
      shape: {
        x: x - 3,
        y: barY - 7,
        width: 6,
        height: 6,
        r: 3,
      },
      style: {
        fill: '#ffffff',
      },
    },
  ];

  return {
    type: 'group',
    children,
  };
}
