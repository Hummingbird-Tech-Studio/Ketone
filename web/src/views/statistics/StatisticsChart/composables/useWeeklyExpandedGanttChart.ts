import { computed, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import type { ExpandedGanttBar } from '../types';
import { COLOR_BAR_TEXT, COLOR_BORDER, COLOR_COMPLETED, COLOR_IN_PROGRESS, COLOR_TEXT } from './chart/constants';
import { createStripeOverlay, formatTooltipContent, parseDuration } from './chart/helpers';
import { useChartLifecycle } from './chart/lifecycle';
import {
  echarts,
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from './chart/types';

interface UseWeeklyExpandedGanttChartOptions {
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  expandedBars: Ref<ExpandedGanttBar[]>;
  onBarClick: (cycleId: string) => void;
  isLoading?: Ref<boolean>;
  isActive?: Ref<boolean>;
}

// Layout constants
const HEADER_HEIGHT = 30;
const DAY_LABEL_WIDTH_DESKTOP = 50;
const DAY_LABEL_WIDTH_MOBILE = 40;
const MOBILE_BREAKPOINT = 400;
const ROW_HEIGHT = 46;
const BAR_HEIGHT = 32;
const BAR_PADDING_TOP = 7;
const BAR_PADDING_HORIZONTAL = 1;
const BAR_BORDER_RADIUS = 6;
const GRID_BORDER_RADIUS = 8;

// Helper to get day label width based on chart width
function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}

export function useWeeklyExpandedGanttChart(
  chartContainer: Ref<HTMLElement | null>,
  options: UseWeeklyExpandedGanttChartOptions,
) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

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

  // Transform expanded bars to chart data format
  const expandedBarsData = computed(() => {
    return options.expandedBars.value.map((bar, i) => ({
      value: [
        bar.dayIndex,
        bar.startHour,
        bar.endHour,
        i, // index to look up string values
        bar.isConnectedToPrevious ? 1 : 0,
        bar.isConnectedToNext ? 1 : 0,
        bar.hasOverflowBefore ? 1 : 0,
        bar.hasOverflowAfter ? 1 : 0,
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
        textAlign: 'center',
        textVerticalAlign: 'middle',
        fontSize: 10,
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

      // Day name (e.g., "Sun")
      children.push({
        type: 'text',
        style: {
          text: labelData.dayName,
          x: dayLabelWidth / 2,
          y: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 - 7,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 500,
          fill: COLOR_TEXT,
        },
      });

      // Day number (e.g., "15")
      children.push({
        type: 'text',
        style: {
          text: labelData.dayNum,
          x: dayLabelWidth / 2,
          y: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2 + 7,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 400,
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
    const hourPositions = [6, 12, 18];
    hourPositions.forEach((hour) => {
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

  // Render function for Gantt bars
  function renderGanttBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0) as number;
    const startHour = api.value(1) as number;
    const endHour = api.value(2) as number;
    const barIndex = api.value(3) as number;
    const isConnectedToPrevious = api.value(4) === 1;
    const isConnectedToNext = api.value(5) === 1;
    const hasOverflowBefore = api.value(6) === 1;
    const hasOverflowAfter = api.value(7) === 1;

    const barData = options.expandedBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { status, duration } = barData;
    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Calculate bar dimensions
    const barX = dayLabelWidth + (startHour / 24) * gridWidth + BAR_PADDING_HORIZONTAL;
    const barWidth = ((endHour - startHour) / 24) * gridWidth - BAR_PADDING_HORIZONTAL * 2;
    const barY = HEADER_HEIGHT + dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

    const finalWidth = Math.max(barWidth, 2);
    const baseColor = status === 'InProgress' ? COLOR_IN_PROGRESS : COLOR_COMPLETED;

    // Determine border radius based on connections
    // Format: [top-left, top-right, bottom-right, bottom-left]
    const topLeftRadius = isConnectedToPrevious ? 0 : BAR_BORDER_RADIUS;
    const topRightRadius = isConnectedToNext ? 0 : BAR_BORDER_RADIUS;
    const bottomRightRadius = isConnectedToNext ? 0 : BAR_BORDER_RADIUS;
    const bottomLeftRadius = isConnectedToPrevious ? 0 : BAR_BORDER_RADIUS;

    const children: RenderItemReturn[] = [
      {
        type: 'rect',
        shape: {
          x: 0,
          y: 0,
          width: finalWidth,
          height: BAR_HEIGHT,
          r: [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius],
        },
        style: {
          fill: baseColor,
        },
      },
    ];

    // Add stripe overlay if there's overflow (week-spanning)
    const stripeOverlay = createStripeOverlay(
      finalWidth,
      BAR_HEIGHT,
      status,
      hasOverflowBefore,
      hasOverflowAfter,
      BAR_BORDER_RADIUS,
    );
    if (stripeOverlay) {
      children.push(stripeOverlay);
    }

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 30) {
      const durationFontSize = chartWidth < MOBILE_BREAKPOINT ? 8 : 9;
      const lineHeight = durationFontSize + 2;

      const { hoursPart, minutesPart } = parseDuration(duration);

      if (hoursPart && minutesPart && finalWidth > 50) {
        // Two lines: hours on top, minutes below
        children.push({
          type: 'text',
          style: {
            text: hoursPart,
            x: finalWidth / 2,
            y: BAR_HEIGHT / 2 - lineHeight / 2,
            textAlign: 'center',
            textVerticalAlign: 'middle',
            fontSize: durationFontSize,
            fontWeight: 600,
            fill: COLOR_BAR_TEXT,
          },
        });
        children.push({
          type: 'text',
          style: {
            text: minutesPart,
            x: finalWidth / 2,
            y: BAR_HEIGHT / 2 + lineHeight / 2,
            textAlign: 'center',
            textVerticalAlign: 'middle',
            fontSize: durationFontSize,
            fontWeight: 600,
            fill: COLOR_BAR_TEXT,
          },
        });
      } else {
        // Single line (only hours or only minutes, or combined if narrow)
        children.push({
          type: 'text',
          style: {
            text: duration,
            x: finalWidth / 2,
            y: BAR_HEIGHT / 2,
            textAlign: 'center',
            textVerticalAlign: 'middle',
            fontSize: durationFontSize,
            fontWeight: 600,
            fill: COLOR_BAR_TEXT,
          },
        });
      }
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
          if (p.seriesIndex !== 2) return ''; // Series 2 = Gantt bars
          const barIndex = p.data?.value?.[3];
          if (barIndex === undefined) return '';
          const bar = options.expandedBars.value[barIndex];
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
        // Series 2: Gantt bars
        {
          type: 'custom',
          renderItem: renderGanttBar as unknown as CustomRenderItem,
          data: expandedBarsData.value,
          clip: true,
        },
      ],
    };
  }

  // Initialize chart
  function initChart() {
    if (!chartContainer.value) return;
    if (options.isActive?.value === false) return;

    // Dispose any existing chart on the container (from another composable)
    const existingChart = echarts.getInstanceByDom(chartContainer.value);
    if (existingChart) {
      existingChart.dispose();
    }

    chartInstance.value = echarts.init(chartContainer.value);
    chartInstance.value.setOption(buildChartOptions());

    // Handle click events on bars
    chartInstance.value.on('click', (params) => {
      if (params.componentType === 'series' && params.seriesIndex === 2) {
        const data = params.data as { value: number[] };
        const barIndex = data.value?.[3];
        if (barIndex !== undefined) {
          const barData = options.expandedBars.value[barIndex];
          if (barData?.cycleId) {
            options.onBarClick(barData.cycleId);
          }
        }
      }
    });

    // Set cursor on hover for bars
    chartInstance.value.on('mouseover', (params) => {
      if (params.componentType === 'series' && params.seriesIndex === 2) {
        chartContainer.value!.style.cursor = 'pointer';
      }
    });

    chartInstance.value.on('mouseout', () => {
      chartContainer.value!.style.cursor = 'default';
    });
  }

  // Setup lifecycle (resize observer, loading state, cleanup)
  const { refresh } = useChartLifecycle({
    chartContainer,
    chartInstance,
    buildChartOptions,
    initChart,
    isLoading: options.isLoading,
  });

  // Watch for data changes
  watch(
    [options.numRows, options.dayLabels, options.expandedBars],
    () => {
      if (options.isActive?.value !== false) {
        refresh();
      }
    },
    { deep: true },
  );

  // Watch for active state changes
  watch(
    () => options.isActive?.value,
    (active) => {
      if (active) {
        if (!chartInstance.value) {
          initChart();
        } else {
          refresh();
        }
      } else if (chartInstance.value) {
        chartInstance.value.dispose();
        chartInstance.value = null;
      }
    },
  );

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
