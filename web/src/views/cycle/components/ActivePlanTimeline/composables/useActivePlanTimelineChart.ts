import { useChartLifecycle } from '@/views/statistics/StatisticsChart/composables/chart/lifecycle';
import {
  echarts,
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import type { PeriodResponse } from '@ketone/shared';
import { computed, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import type { ActivePlanTimelineBar } from '../types';

// Status-based colors
const COLOR_FASTING_COMPLETED = '#96F4A0'; // Green - completed fast
const COLOR_FASTING_ACTIVE = '#d795ff'; // Purple - active fast
const COLOR_FASTING_PLANNED = '#7ABDFF'; // Blue - planned fast
const COLOR_EATING = '#FFC9B4'; // Orange - eating window

// Highlight colors (slightly darker for hover effect)
const COLOR_FASTING_COMPLETED_HIGHLIGHT = '#7ed889';
const COLOR_FASTING_ACTIVE_HIGHLIGHT = '#c080e8';
const COLOR_FASTING_PLANNED_HIGHLIGHT = '#5fa8e8';
const COLOR_EATING_HIGHLIGHT = '#e8b09d';

// Location marker color
const COLOR_LOCATION_MARKER = '#e57373'; // Pink/red for current position

// Other colors
const COLOR_BAR_TEXT = '#000000';
const COLOR_BORDER = '#e0e0e0';
const COLOR_TEXT = '#494949';

// Layout constants
const HEADER_HEIGHT = 30;
const DAY_LABEL_WIDTH_DESKTOP = 52;
const DAY_LABEL_WIDTH_MOBILE = 42;
const MOBILE_BREAKPOINT = 400;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 28;
const BAR_PADDING_TOP = 6;
const BAR_PADDING_HORIZONTAL = 1;
const BAR_BORDER_RADIUS = 4;
const GRID_BORDER_RADIUS = 8;

const UNHOVERED_OPACITY = 0.4;

interface CurrentTimePosition {
  dayIndex: number;
  hourPosition: number;
  isInFasting: boolean;
}

interface UseActivePlanTimelineChartOptions {
  // Data
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<ActivePlanTimelineBar[]>;
  periods: Ref<readonly PeriodResponse[]>;
  currentTimePosition: Ref<CurrentTimePosition | null>;

  // State
  hoveredPeriodIndex: Ref<number>;

  // Event handlers
  onHoverPeriod: (periodIndex: number) => void;
  onHoverExit: () => void;
}

function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}

export function useActivePlanTimelineChart(
  chartContainer: Ref<HTMLElement | null>,
  options: UseActivePlanTimelineChartOptions,
) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Cached segment positions - computed once per data change instead of per-bar per-render
  const segmentPositionCache = computed(() => {
    const cache = new Map<number, { isFirstSegment: boolean; isLastSegment: boolean }>();
    const allBars = options.timelineBars.value;

    // Group bars by periodIndex-type key
    const barGroups = new Map<string, ActivePlanTimelineBar[]>();
    for (const bar of allBars) {
      const key = `${bar.periodIndex}-${bar.type}`;
      const group = barGroups.get(key) ?? [];
      group.push(bar);
      barGroups.set(key, group);
    }

    // Sort each group and determine first/last positions
    for (const group of barGroups.values()) {
      const sortedBars = [...group].sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.startHour - b.startHour;
      });

      for (let i = 0; i < sortedBars.length; i++) {
        const bar = sortedBars[i]!;
        const barIndex = allBars.indexOf(bar);
        cache.set(barIndex, {
          isFirstSegment: i === 0,
          isLastSegment: i === sortedBars.length - 1,
        });
      }
    }

    return cache;
  });

  function getSegmentPosition(barIndex: number): { isFirstSegment: boolean; isLastSegment: boolean } {
    const cached = segmentPositionCache.value.get(barIndex);
    if (cached) return cached;
    return { isFirstSegment: false, isLastSegment: false };
  }

  // Parse day labels for direct access in renderItem
  const parsedDayLabels = computed(() => {
    return options.dayLabels.value.map((label) => {
      const parts = label.split('\n');
      return { dayName: parts[0], dayNum: parts[1] };
    });
  });

  // Transform hour labels to chart data format
  const hourLabelsData = computed(() => {
    return options.hourLabels.value.map((_, i) => ({
      value: [i],
    }));
  });

  // Transform timeline bars to chart data format
  const timelineBarsData = computed(() => {
    const hoveredPeriod = options.hoveredPeriodIndex.value;
    return options.timelineBars.value.map((bar, i) => ({
      value: [
        bar.dayIndex,
        bar.startHour,
        bar.endHour,
        i, // index to look up bar data
        bar.periodIndex, // period index for grouping
        hoveredPeriod, // included to trigger re-render on hover change
      ],
    }));
  });

  // Marker data - include current time position values to trigger re-render
  const markerData = computed(() => {
    const pos = options.currentTimePosition.value;
    if (!pos) return [{ value: [-1, -1] }]; // Invalid position that won't render
    return [{ value: [pos.dayIndex, pos.hourPosition] }];
  });

  // Render function for hour labels header
  function renderHourLabels(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const index = api.value(0);
    const hourLabel = options.hourLabels.value[index];
    const hourPosition = options.hourPositions.value[index];
    if (hourLabel === undefined || hourPosition === undefined) return { type: 'group', children: [] };

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
  }

  // Render function for grid background with day labels
  function renderGridBackground(params: RenderItemParams): RenderItemReturn {
    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const numRows = options.numRows.value;
    const gridWidth = chartWidth - dayLabelWidth;
    const gridHeight = numRows * ROW_HEIGHT;

    const children: RenderItemReturn[] = [];

    // Day labels on the left
    for (let i = 0; i < numRows; i++) {
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
    for (let i = 1; i < numRows; i++) {
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
  }

  /**
   * Get the bar color based on period state and bar type
   */
  function getBarColor(barType: 'fasting' | 'eating', periodState: string, isHighlighted: boolean): string {
    if (barType === 'eating') {
      return isHighlighted ? COLOR_EATING_HIGHLIGHT : COLOR_EATING;
    }

    // Fasting bar - color based on state
    switch (periodState) {
      case 'completed':
        return isHighlighted ? COLOR_FASTING_COMPLETED_HIGHLIGHT : COLOR_FASTING_COMPLETED;
      case 'in_progress':
        return isHighlighted ? COLOR_FASTING_ACTIVE_HIGHLIGHT : COLOR_FASTING_ACTIVE;
      case 'scheduled':
      default:
        return isHighlighted ? COLOR_FASTING_PLANNED_HIGHLIGHT : COLOR_FASTING_PLANNED;
    }
  }

  // Render function for timeline bars
  function renderTimelineBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0);
    const startHour = api.value(1);
    const endHour = api.value(2);
    const barIndex = api.value(3);
    const periodIndex = api.value(4);

    const barData = options.timelineBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { type, duration, periodState } = barData;
    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Check for connecting bars in the same period
    const allBars = options.timelineBars.value;

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

    // Get highlighted period from hover
    const highlightedPeriod = options.hoveredPeriodIndex.value;
    const isHighlighted = highlightedPeriod === periodIndex;
    const hasHighlight = highlightedPeriod !== -1;

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

    // Determine colors based on type, state, and hover state
    let textOpacity = 1;
    let barOpacity = 1;
    const barColor = getBarColor(type, periodState, isHighlighted);

    if (hasHighlight && !isHighlighted) {
      // Another period is highlighted - dim this one
      textOpacity = UNHOVERED_OPACITY;
      barOpacity = UNHOVERED_OPACITY;
    }

    // Border radius: [top-left, top-right, bottom-right, bottom-left]
    const borderRadius: [number, number, number, number] = [leftRadius, rightRadius, rightRadius, leftRadius];

    const children: RenderItemReturn[] = [
      {
        type: 'rect',
        shape: {
          x: 0,
          y: 0,
          width: finalWidth,
          height: BAR_HEIGHT,
          r: borderRadius,
        },
        style: {
          fill: barColor,
          opacity: barOpacity,
        },
      },
    ];

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 25) {
      const fontSize = chartWidth < MOBILE_BREAKPOINT ? 10 : 11;
      children.push({
        type: 'text',
        style: {
          text: duration,
          x: finalWidth / 2,
          y: BAR_HEIGHT / 2,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize,
          fontWeight: 600,
          fill: COLOR_BAR_TEXT,
          opacity: textOpacity,
        },
      });
    }

    return {
      type: 'group',
      x: barX,
      y: barY,
      children,
    };
  }

  // Render location marker at current time position
  function renderLocationMarker(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
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

  // Calculate total chart height
  const chartHeight = computed(() => {
    return HEADER_HEIGHT + options.numRows.value * ROW_HEIGHT;
  });

  // Format tooltip content for period info
  function formatTooltipContent(barData: ActivePlanTimelineBar): string {
    const period = options.periods.value[barData.periodIndex];
    if (!period) return '';

    const fastingHours = period.fastingDuration;
    const eatingHours = period.eatingWindow;
    const totalHours = fastingHours + eatingHours;
    const periodNumber = barData.periodIndex + 1;

    const startDate = period.startDate instanceof Date ? period.startDate : new Date(period.startDate);
    const formattedStartDate = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(startDate);

    return `
      <div style="line-height: 1.6; min-width: 140px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${COLOR_TEXT};">Period ${periodNumber}</div>
        <div><span style="font-weight: 500;">Start:</span> ${formattedStartDate}</div>
        <div><span style="font-weight: 500;">Fast Duration:</span> ${fastingHours}h</div>
        <div><span style="font-weight: 500;">Eating Window:</span> ${eatingHours}h</div>
        <div style="border-top: 1px solid #eee; margin-top: 4px; padding-top: 4px;">
          <span style="font-weight: 600;">Total:</span> ${totalHours}h
        </div>
      </div>
    `;
  }

  // Build chart options
  function buildChartOptions(): ECOption {
    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: COLOR_BORDER,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: COLOR_TEXT,
          fontSize: 12,
        },
        formatter: (params: unknown) => {
          const p = params as { seriesIndex: number; data: { value: number[] } };
          if (p.seriesIndex !== 2) return '';
          const barIndex = p.data?.value?.[3];
          if (barIndex === undefined) return '';
          const bar = options.timelineBars.value[barIndex];
          if (!bar) return '';
          return formatTooltipContent(bar);
        },
      },
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: 24,
        show: false,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: options.numRows.value,
        show: false,
      },
      series: [
        // Series 0: Hour labels header
        {
          type: 'custom',
          renderItem: renderHourLabels as unknown as CustomRenderItem,
          data: hourLabelsData.value,
          silent: true,
          z: 1,
        },
        // Series 1: Grid background with day labels
        {
          type: 'custom',
          renderItem: renderGridBackground as unknown as CustomRenderItem,
          data: [{ value: [0] }],
          silent: true,
          z: 2,
        },
        // Series 2: Timeline bars
        {
          type: 'custom',
          renderItem: renderTimelineBar as unknown as CustomRenderItem,
          data: timelineBarsData.value,
          z: 10,
        },
        // Series 3: Location marker (rendered last to be on top)
        {
          id: 'marker',
          type: 'custom',
          renderItem: renderLocationMarker as unknown as CustomRenderItem,
          data: markerData.value,
          silent: true,
          z: 100, // Ensure marker is always on top
        },
      ],
    };
  }

  // Initialize chart
  function initChart() {
    if (!chartContainer.value) return;

    // Dispose any existing chart on the container
    const existingChart = echarts.getInstanceByDom(chartContainer.value);
    if (existingChart) {
      existingChart.dispose();
    }

    chartInstance.value = echarts.init(chartContainer.value);
    chartInstance.value.setOption(buildChartOptions());

    // Set up hover event handlers for period highlighting
    chartInstance.value.on('mouseover', { seriesIndex: 2 }, (params: unknown) => {
      const p = params as { data: { value: number[] } };
      const periodIndex = p.data?.value?.[4];
      if (periodIndex !== undefined && periodIndex !== options.hoveredPeriodIndex.value) {
        options.onHoverPeriod(periodIndex);
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 2 }, () => {
      options.onHoverExit();
    });
  }

  // Setup lifecycle (resize observer, cleanup)
  const { refresh } = useChartLifecycle({
    chartContainer,
    chartInstance,
    buildChartOptions,
    initChart,
  });

  // Watch for data changes (excluding currentTimePosition to avoid constant re-renders)
  watch(
    [options.numRows, options.dayLabels, options.timelineBars],
    () => {
      if (!chartInstance.value) return;
      refresh();
    },
    { deep: true },
  );

  // Watch for marker position changes - only update the marker series data
  watch(
    options.currentTimePosition,
    () => {
      if (!chartInstance.value) return;
      // Only update the marker series (series index 3) without touching other series
      chartInstance.value.setOption({
        series: [{ id: 'marker', data: markerData.value }],
      });
    },
    { deep: true },
  );

  // Watch for hover state changes to update bar highlighting
  watch([options.hoveredPeriodIndex], () => {
    if (chartInstance.value) {
      // Force complete re-render by clearing and rebuilding
      chartInstance.value.clear();
      chartInstance.value.setOption(buildChartOptions());
    }
  });

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
