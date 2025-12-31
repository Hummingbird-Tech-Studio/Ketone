import { computed, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import {
  COLOR_BAR_TEXT,
  COLOR_BORDER,
  COLOR_COMPLETED,
  COLOR_DATE_TEXT,
  COLOR_IN_PROGRESS,
  COLOR_TEXT,
} from './chart/constants';
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

export interface MonthlyGanttBar {
  cycleId: string;
  weekIndex: number;
  startPos: number;
  endPos: number;
  duration: string;
  status: 'InProgress' | 'Completed';
  isExtended: boolean;
  hasOverflowBefore: boolean;
  hasOverflowAfter: boolean;
  // Tooltip data
  totalDuration: string;
  startDate: Date;
  endDate: Date;
}

interface UseMonthlyGanttChartOptions {
  numWeeks: Ref<number>;
  dayLabels: Ref<string[]>;
  weekDates: Ref<(number | null)[][]>;
  ganttBars: Ref<MonthlyGanttBar[]>;
  onBarClick: (cycleId: string) => void;
  isLoading?: Ref<boolean>;
}

// Layout constants
const HEADER_HEIGHT = 30;
const WEEK_LABEL_WIDTH_DESKTOP = 50;
const WEEK_LABEL_WIDTH_MOBILE = 32;
const MOBILE_BREAKPOINT = 400;
const ROW_HEIGHT = 70;
const BAR_HEIGHT = 38;
const BAR_PADDING_HORIZONTAL = 1;
const BAR_BORDER_RADIUS = 6;
const GRID_BORDER_RADIUS = 8;
const DATE_NUMBER_Y_OFFSET = 16;
const BAR_Y_OFFSET = 26;

// Helper to get week label width based on chart width
function getWeekLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? WEEK_LABEL_WIDTH_MOBILE : WEEK_LABEL_WIDTH_DESKTOP;
}

// Helper to get week label text based on chart width
function getWeekLabelText(weekIndex: number, chartWidth: number): string {
  return chartWidth < MOBILE_BREAKPOINT ? `Wk ${weekIndex + 1}` : `Week ${weekIndex + 1}`;
}

export function useMonthlyGanttChart(chartContainer: Ref<HTMLElement | null>, options: UseMonthlyGanttChartOptions) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Transform day labels to chart data format
  const dayLabelsData = computed(() => {
    return options.dayLabels.value.map((_, i) => ({
      value: [i],
    }));
  });

  // Transform week dates to chart data format (flatten all cells)
  const weekDatesData = computed(() => {
    const data: { value: number[] }[] = [];
    options.weekDates.value.forEach((week, weekIndex) => {
      week.forEach((date, dayIndex) => {
        data.push({
          value: [dayIndex, weekIndex, date ?? -1],
        });
      });
    });
    return data;
  });

  // Transform gantt bars to chart data format
  const ganttBarsData = computed(() => {
    return options.ganttBars.value.map((bar, i) => ({
      value: [bar.startPos, bar.endPos, bar.weekIndex, i, bar.hasOverflowBefore ? 1 : 0, bar.hasOverflowAfter ? 1 : 0],
    }));
  });

  // Render function for day labels header
  function renderDayLabels(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const index = api.value(0) as number;
    const dayLabel = options.dayLabels.value[index];
    if (!dayLabel) return { type: 'group', children: [] };

    const chartWidth = params.coordSys.width;
    const weekLabelWidth = getWeekLabelWidth(chartWidth);
    const gridWidth = chartWidth - weekLabelWidth;
    const colWidth = gridWidth / 7;
    const x = weekLabelWidth + (index + 0.5) * colWidth;

    return {
      type: 'text',
      style: {
        text: dayLabel,
        x,
        y: HEADER_HEIGHT / 2,
        textAlign: 'center',
        textVerticalAlign: 'middle',
        fontSize: 11,
        fontWeight: 500,
        fill: COLOR_TEXT,
      },
    };
  }

  // Render function for week dates (date numbers in cells)
  function renderWeekDates(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0) as number;
    const weekIndex = api.value(1) as number;
    const dateNum = api.value(2) as number;

    if (dateNum < 0) return { type: 'group', children: [] };

    const chartWidth = params.coordSys.width;
    const weekLabelWidth = getWeekLabelWidth(chartWidth);
    const gridWidth = chartWidth - weekLabelWidth;
    const colWidth = gridWidth / 7;
    const x = weekLabelWidth + (dayIndex + 0.5) * colWidth;
    const y = HEADER_HEIGHT + weekIndex * ROW_HEIGHT + DATE_NUMBER_Y_OFFSET;

    return {
      type: 'text',
      style: {
        text: String(dateNum),
        x,
        y,
        textAlign: 'center',
        textVerticalAlign: 'middle',
        fontSize: 10,
        fontWeight: 400,
        fill: COLOR_DATE_TEXT,
      },
    };
  }

  // Render function for grid background with week labels
  function renderGridBackground(params: RenderItemParams): RenderItemReturn {
    const chartWidth = params.coordSys.width;
    const weekLabelWidth = getWeekLabelWidth(chartWidth);
    const numWeeks = options.numWeeks.value;
    const gridWidth = chartWidth - weekLabelWidth;
    const gridHeight = numWeeks * ROW_HEIGHT;

    const children: RenderItemReturn[] = [];

    // Week labels on the left
    for (let i = 0; i < numWeeks; i++) {
      children.push({
        type: 'text',
        style: {
          text: getWeekLabelText(i, chartWidth),
          x: weekLabelWidth / 2,
          y: HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 500,
          fill: COLOR_TEXT,
        },
      });
    }

    // Grid border
    children.push({
      type: 'rect',
      shape: {
        x: weekLabelWidth,
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

    // Vertical dividers
    for (let i = 1; i < 7; i++) {
      const x = weekLabelWidth + (i / 7) * gridWidth;
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
    }

    // Horizontal dividers between weeks
    for (let i = 1; i < numWeeks; i++) {
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      children.push({
        type: 'line',
        shape: {
          x1: weekLabelWidth,
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
    const startPos = api.value(0) as number;
    const endPos = api.value(1) as number;
    const weekIndex = api.value(2) as number;
    const barIndex = api.value(3) as number;
    const hasOverflowBefore = api.value(4) === 1;
    const hasOverflowAfter = api.value(5) === 1;

    const barData = options.ganttBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { status, duration } = barData;
    const chartWidth = params.coordSys.width;
    const weekLabelWidth = getWeekLabelWidth(chartWidth);
    const gridWidth = chartWidth - weekLabelWidth;
    const colWidth = gridWidth / 7;

    // Calculate bar dimensions
    const barX = weekLabelWidth + startPos * colWidth + BAR_PADDING_HORIZONTAL;
    const barWidth = (endPos - startPos) * colWidth - BAR_PADDING_HORIZONTAL * 2;
    const barY = HEADER_HEIGHT + weekIndex * ROW_HEIGHT + BAR_Y_OFFSET;

    const finalWidth = Math.max(barWidth, 2);
    const baseColor = status === 'InProgress' ? COLOR_IN_PROGRESS : COLOR_COMPLETED;

    const children: RenderItemReturn[] = [
      {
        type: 'rect',
        shape: {
          x: 0,
          y: 0,
          width: finalWidth,
          height: BAR_HEIGHT,
          r: BAR_BORDER_RADIUS,
        },
        style: {
          fill: baseColor,
        },
      },
    ];

    // Add stripe overlay if there's overflow
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
    if (finalWidth > 20) {
      const durationFontSize = chartWidth < MOBILE_BREAKPOINT ? 9 : 10;
      const lineHeight = durationFontSize + 2;

      const { hoursPart, minutesPart } = parseDuration(duration);

      if (hoursPart && minutesPart) {
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
        // Single line (only hours or only minutes)
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
    return HEADER_HEIGHT + options.numWeeks.value * ROW_HEIGHT;
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
          if (p.seriesIndex !== 3) return ''; // Series 3 = Gantt bars in monthly chart
          const barIndex = p.data?.value?.[3];
          if (barIndex === undefined) return '';
          const bar = options.ganttBars.value[barIndex];
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
        max: 7,
        show: false,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: options.numWeeks.value,
        show: false,
      },
      series: [
        // Series 0: Day labels header
        {
          type: 'custom',
          renderItem: renderDayLabels as unknown as CustomRenderItem,
          data: dayLabelsData.value,
          silent: true,
        },
        // Series 1: Grid background with week labels
        {
          type: 'custom',
          renderItem: renderGridBackground as unknown as CustomRenderItem,
          data: [{ value: [0] }],
          silent: true,
        },
        // Series 2: Week dates (date numbers in cells)
        {
          type: 'custom',
          renderItem: renderWeekDates as unknown as CustomRenderItem,
          data: weekDatesData.value,
          silent: true,
        },
        // Series 3: Gantt bars
        {
          type: 'custom',
          renderItem: renderGanttBar as unknown as CustomRenderItem,
          data: ganttBarsData.value,
          clip: true,
        },
      ],
    };
  }

  // Initialize chart
  function initChart() {
    if (!chartContainer.value) return;

    chartInstance.value = echarts.init(chartContainer.value);
    chartInstance.value.setOption(buildChartOptions());

    // Handle click events on bars
    chartInstance.value.on('click', (params) => {
      if (params.componentType === 'series' && params.seriesIndex === 3) {
        const data = params.data as { value: number[] };
        const barIndex = data.value?.[3];
        if (barIndex !== undefined) {
          const barData = options.ganttBars.value[barIndex];
          if (barData?.cycleId) {
            options.onBarClick(barData.cycleId);
          }
        }
      }
    });

    // Set cursor on hover for bars
    chartInstance.value.on('mouseover', (params) => {
      if (params.componentType === 'series' && params.seriesIndex === 3) {
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
    [options.numWeeks, options.dayLabels, options.weekDates, options.ganttBars],
    () => {
      refresh();
    },
    { deep: true },
  );

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
