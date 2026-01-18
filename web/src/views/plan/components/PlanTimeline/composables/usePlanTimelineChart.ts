import { useChartLifecycle } from '@/views/statistics/StatisticsChart/composables/chart/lifecycle';
import {
  echarts,
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import { computed, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import type { PeriodConfig, TimelineBar } from '../types';
import {
  BAR_BORDER_RADIUS,
  BAR_HEIGHT,
  BAR_PADDING_HORIZONTAL,
  BAR_PADDING_TOP,
  COLOR_BAR_TEXT,
  COLOR_BORDER,
  COLOR_EATING,
  COLOR_FASTING,
  COLOR_TEXT,
  DAY_LABEL_WIDTH_DESKTOP,
  DAY_LABEL_WIDTH_MOBILE,
  GRID_BORDER_RADIUS,
  HEADER_HEIGHT,
  MOBILE_BREAKPOINT,
  ROW_HEIGHT,
} from './chart/constants';

// Highlight colors (slightly darker/more saturated)
const COLOR_FASTING_HIGHLIGHT = '#4a8ac4';
const COLOR_EATING_HIGHLIGHT = '#e5a070';
const UNHOVERED_OPACITY = 0.4;

interface UsePlanTimelineChartOptions {
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<TimelineBar[]>;
  periodConfigs: Ref<PeriodConfig[]>;
  onPeriodClick?: (periodIndex: number) => void;
}

function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}

export function usePlanTimelineChart(chartContainer: Ref<HTMLElement | null>, options: UsePlanTimelineChartOptions) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Track which period is currently hovered (-1 = none)
  const hoveredPeriodIndex = ref(-1);

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
    return options.timelineBars.value.map((bar, i) => ({
      value: [
        bar.dayIndex,
        bar.startHour,
        bar.endHour,
        i, // index to look up bar data
        bar.periodIndex, // period index for grouping
      ],
    }));
  });

  // Render function for hour labels header
  function renderHourLabels(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const index = api.value(0) as number;
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

  // Render function for timeline bars
  function renderTimelineBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0) as number;
    const startHour = api.value(1) as number;
    const endHour = api.value(2) as number;
    const barIndex = api.value(3) as number;
    const periodIndex = api.value(4) as number;

    const barData = options.timelineBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { type, duration } = barData;
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
    // A bar continues from previous day if there's ANY bar on the previous day that ends at 24
    // (regardless of period - the visual should be seamless)
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

    // Determine if this bar's period is highlighted
    const isHovered = hoveredPeriodIndex.value === periodIndex;
    const hasHover = hoveredPeriodIndex.value !== -1;

    // Apply colors based on hover state
    let barColor: string;
    let textOpacity = 1;
    if (hasHover && !isHovered) {
      // Another period is hovered - dim this one
      barColor = type === 'fasting' ? COLOR_FASTING : COLOR_EATING;
      textOpacity = UNHOVERED_OPACITY;
    } else if (isHovered) {
      // This period is hovered - highlight
      barColor = type === 'fasting' ? COLOR_FASTING_HIGHLIGHT : COLOR_EATING_HIGHLIGHT;
    } else {
      // No hover - normal colors
      barColor = type === 'fasting' ? COLOR_FASTING : COLOR_EATING;
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
          opacity: hasHover && !isHovered ? UNHOVERED_OPACITY : 1,
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

  // Calculate total chart height
  const chartHeight = computed(() => {
    return HEADER_HEIGHT + options.numRows.value * ROW_HEIGHT;
  });

  // Format tooltip content for period info
  function formatTooltipContent(barData: TimelineBar): string {
    const periodConfig = options.periodConfigs.value[barData.periodIndex];
    if (!periodConfig) return '';

    const fastingHours = periodConfig.fastingDuration;
    const eatingHours = periodConfig.eatingWindow;
    const totalHours = fastingHours + eatingHours;
    const periodNumber = barData.periodIndex + 1;

    return `
      <div style="line-height: 1.6; min-width: 140px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${COLOR_TEXT};">Period ${periodNumber}</div>
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
        },
        // Series 1: Grid background with day labels
        {
          type: 'custom',
          renderItem: renderGridBackground as unknown as CustomRenderItem,
          data: [{ value: [0] }],
          silent: true,
        },
        // Series 2: Timeline bars (not silent for tooltip interaction)
        {
          type: 'custom',
          renderItem: renderTimelineBar as unknown as CustomRenderItem,
          data: timelineBarsData.value,
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
      if (periodIndex !== undefined && periodIndex !== hoveredPeriodIndex.value) {
        hoveredPeriodIndex.value = periodIndex;
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 2 }, () => {
      if (hoveredPeriodIndex.value !== -1) {
        hoveredPeriodIndex.value = -1;
      }
    });

    // Set up click handler for period selection
    chartInstance.value.on('click', { seriesIndex: 2 }, (params: unknown) => {
      const p = params as { data: { value: number[] } };
      const periodIndex = p.data?.value?.[4];
      if (periodIndex !== undefined && options.onPeriodClick) {
        options.onPeriodClick(periodIndex);
      }
    });
  }

  // Setup lifecycle (resize observer, cleanup)
  const { refresh } = useChartLifecycle({
    chartContainer,
    chartInstance,
    buildChartOptions,
    initChart,
  });

  // Watch for data changes
  watch(
    [options.numRows, options.dayLabels, options.timelineBars],
    () => {
      refresh();
    },
    { deep: true },
  );

  // Watch for hover state changes to update bar highlighting
  watch(hoveredPeriodIndex, () => {
    if (chartInstance.value) {
      chartInstance.value.setOption(buildChartOptions());
    }
  });

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
