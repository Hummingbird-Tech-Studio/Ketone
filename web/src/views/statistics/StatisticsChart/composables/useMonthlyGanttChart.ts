import { CustomChart, type CustomSeriesOption } from 'echarts/charts';
import { GridComponent, type GridComponentOption } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { computed, onMounted, onUnmounted, shallowRef, watch, type Ref, type ShallowRef } from 'vue';

// Extract the renderItem type from CustomSeriesOption to ensure compatibility
type CustomRenderItem = NonNullable<CustomSeriesOption['renderItem']>;

// Register required eCharts modules
echarts.use([CustomChart, GridComponent, CanvasRenderer]);

type ECOption = echarts.ComposeOption<CustomSeriesOption | GridComponentOption>;

// Custom types for eCharts renderItem functions
interface RenderItemParams {
  coordSys: {
    width: number;
    height: number;
  };
}

interface RenderItemAPI {
  value: (dimensionIndex: number) => number;
}

interface RenderItemStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  text?: string;
  x?: number;
  y?: number;
  textAlign?: 'left' | 'center' | 'right';
  textVerticalAlign?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
  fontWeight?: number;
}

interface RenderItemShape {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface RenderItemElement {
  type: 'group' | 'rect' | 'text' | 'line';
  x?: number;
  y?: number;
  shape?: RenderItemShape;
  style?: RenderItemStyle;
  children?: RenderItemElement[];
  clipPath?: {
    type: 'rect';
    shape: RenderItemShape;
  };
}

type RenderItemReturn = RenderItemElement;

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
}

interface UseMonthlyGanttChartOptions {
  numWeeks: Ref<number>;
  dayLabels: Ref<string[]>;
  weekDates: Ref<(number | null)[][]>;
  ganttBars: Ref<MonthlyGanttBar[]>;
  onBarClick: (cycleId: string) => void;
}

// Colors
const COLOR_COMPLETED = '#96f4a0';
const COLOR_IN_PROGRESS = '#d795ff';
const COLOR_BORDER = '#e0e0e0';
const COLOR_TEXT = '#494949';
const COLOR_BAR_TEXT = '#333';
const COLOR_DATE_TEXT = '#888';

// Layout constants
const HEADER_HEIGHT = 30;
const WEEK_LABEL_WIDTH_DESKTOP = 50;
const WEEK_LABEL_WIDTH_MOBILE = 32;
const MOBILE_BREAKPOINT = 400;
const ROW_HEIGHT = 70;
const BAR_HEIGHT = 24;
const BAR_PADDING_HORIZONTAL = 2;
const BAR_BORDER_RADIUS = 6;
const GRID_BORDER_RADIUS = 8;
const DATE_NUMBER_Y_OFFSET = 16;
const BAR_Y_OFFSET = 40;

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
      value: [
        bar.startPos,
        bar.endPos,
        bar.weekIndex,
        i,
        bar.hasOverflowBefore ? 1 : 0,
        bar.hasOverflowAfter ? 1 : 0,
      ],
    }));
  });

  // Create stripe pattern overlay for overflow indication
  function createStripeOverlay(
    width: number,
    height: number,
    status: 'InProgress' | 'Completed',
    hasOverflowBefore: boolean,
    hasOverflowAfter: boolean,
  ): RenderItemReturn | null {
    if (!hasOverflowBefore && !hasOverflowAfter) return null;

    const stripeColor = status === 'InProgress' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)';
    const lines: RenderItemReturn[] = [];
    const spacing = 8;

    for (let i = -height; i < width + height; i += spacing) {
      lines.push({
        type: 'line',
        shape: {
          x1: i,
          y1: height,
          x2: i + height,
          y2: 0,
        },
        style: {
          stroke: stripeColor,
          lineWidth: 2,
        },
      });
    }

    return {
      type: 'group',
      children: lines,
      clipPath: {
        type: 'rect',
        shape: { x: 0, y: 0, width, height, r: BAR_BORDER_RADIUS },
      },
    } as RenderItemReturn;
  }

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
    const stripeOverlay = createStripeOverlay(finalWidth, BAR_HEIGHT, status, hasOverflowBefore, hasOverflowAfter);
    if (stripeOverlay) {
      children.push(stripeOverlay);
    }

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 30) {
      children.push({
        type: 'text',
        style: {
          text: duration,
          x: finalWidth / 2,
          y: BAR_HEIGHT / 2,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 10,
          fontWeight: 600,
          fill: COLOR_BAR_TEXT,
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
    return HEADER_HEIGHT + options.numWeeks.value * ROW_HEIGHT;
  });

  // Build chart options
  function buildChartOptions(): ECOption {
    return {
      animation: false,
      grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        containLabel: false,
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

  // Refresh chart with new data
  function refresh() {
    if (!chartInstance.value) return;
    chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
  }

  // Handle resize
  function handleResize() {
    chartInstance.value?.resize();
  }

  // Setup resize observer
  let resizeObserver: ResizeObserver | null = null;

  onMounted(() => {
    initChart();

    if (chartContainer.value) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(chartContainer.value);
    }
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    chartInstance.value?.dispose();
    chartInstance.value = null;
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
