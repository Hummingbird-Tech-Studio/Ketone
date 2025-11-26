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

// Custom types for eCharts renderItem functions.
// eCharts 6.x exported types have internal conflicts, so we define our own based on actual usage.
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

interface GanttBar {
  cycleId: string;
  startPos: number;
  endPos: number;
  duration: string;
  status: 'InProgress' | 'Completed';
  isExtended: boolean;
  hasOverflowBefore: boolean;
  hasOverflowAfter: boolean;
}

interface UseGanttChartOptions {
  numColumns: Ref<number>;
  dayLabels: Ref<string[]>;
  ganttBars: Ref<GanttBar[]>;
  onBarClick: (cycleId: string) => void;
}

// Colors
const COLOR_COMPLETED = '#96f4a0';
const COLOR_IN_PROGRESS = '#d795ff';
const COLOR_BORDER = '#e0e0e0';
const COLOR_TEXT = '#494949';
const COLOR_BAR_TEXT = '#333';

// Layout constants
const LABELS_HEIGHT = 40;
const BAR_PADDING_TOP = 6;
const BAR_PADDING_HORIZONTAL = 1; // Distance from the edge of the chart
const BAR_BORDER_RADIUS = 8;
const GRID_BORDER_RADIUS = 12;

export function useGanttChart(chartContainer: Ref<HTMLElement | null>, options: UseGanttChartOptions) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Parse day labels for direct access in renderItem (api.value only works with numbers)
  const parsedDayLabels = computed(() => {
    return options.dayLabels.value.map((label) => {
      const parts = label.split('\n');
      return { dayName: parts[0], dayNum: parts[1] };
    });
  });

  // Transform day labels to chart data format - only pass index
  const dayLabelsData = computed(() => {
    return options.dayLabels.value.map((_, i) => ({
      value: [i],
    }));
  });

  // Transform gantt bars to chart data format - only pass numeric values
  // String values (status, cycleId, duration) are accessed via index from ganttBars
  const ganttBarsData = computed(() => {
    return options.ganttBars.value.map((bar, i) => ({
      value: [
        bar.startPos,
        bar.endPos,
        i, // index to look up string values
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

    // For active (purple) cycles, use white semi-transparent stripes
    // For completed (green) cycles, use dark semi-transparent stripes
    const stripeColor = status === 'InProgress' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)';

    const lines: RenderItemReturn[] = [];
    const spacing = 4;

    // Generate diagonal lines across the entire bar
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

  // Render function for day labels
  function renderDayLabels(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const index = api.value(0) as number;
    const labelData = parsedDayLabels.value[index];
    if (!labelData) return { type: 'group', children: [] };

    const { dayName, dayNum } = labelData;
    const numCols = options.numColumns.value;
    const chartWidth = params.coordSys.width;

    // Calculate position X centered in the column
    const x = ((index + 0.5) / numCols) * chartWidth;

    const children: RenderItemReturn[] = [
      {
        type: 'text',
        style: {
          text: dayName,
          x,
          y: dayNum ? 10 : 18,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 11,
          fontWeight: 500,
          fill: COLOR_TEXT,
        },
      },
    ];

    if (dayNum) {
      children.push({
        type: 'text',
        style: {
          text: dayNum,
          x,
          y: 26,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 11,
          fontWeight: 400,
          fill: COLOR_TEXT,
        },
      });
    }

    return {
      type: 'group',
      children,
    };
  }

  // Render function for grid background with dividers
  function renderGridBackground(params: RenderItemParams): RenderItemReturn {
    const chartWidth = params.coordSys.width;
    const chartHeight = params.coordSys.height;
    const numCols = options.numColumns.value;

    const children: RenderItemReturn[] = [
      // Background with rounded border
      {
        type: 'rect',
        shape: {
          x: 0,
          y: LABELS_HEIGHT,
          width: chartWidth,
          height: chartHeight,
          r: GRID_BORDER_RADIUS,
        },
        style: {
          fill: 'transparent',
          stroke: COLOR_BORDER,
          lineWidth: 1,
        },
      },
    ];

    // Vertical dividers
    for (let i = 1; i < numCols; i++) {
      const x = (i / numCols) * chartWidth;
      children.push({
        type: 'line',
        shape: {
          x1: x,
          y1: LABELS_HEIGHT,
          x2: x,
          y2: LABELS_HEIGHT + chartHeight,
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
    const barIndex = api.value(2) as number;
    const hasOverflowBefore = api.value(3) === 1;
    const hasOverflowAfter = api.value(4) === 1;

    // Look up string values from original data
    const barData = options.ganttBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { status, duration } = barData;
    const numCols = options.numColumns.value;
    const chartWidth = params.coordSys.width;
    const chartHeight = params.coordSys.height;

    // Calculate bar dimensions
    const barX = (startPos / numCols) * chartWidth + BAR_PADDING_HORIZONTAL;
    const barWidth = ((endPos - startPos) / numCols) * chartWidth - BAR_PADDING_HORIZONTAL * 2;
    const barY = LABELS_HEIGHT + BAR_PADDING_TOP;
    const barHeight = chartHeight - BAR_PADDING_TOP * 2;

    // Ensure minimum width
    const finalWidth = Math.max(barWidth, 2);

    const baseColor = status === 'InProgress' ? COLOR_IN_PROGRESS : COLOR_COMPLETED;

    const children: RenderItemReturn[] = [
      // Main bar rectangle
      {
        type: 'rect',
        shape: {
          x: 0,
          y: 0,
          width: finalWidth,
          height: barHeight,
          r: BAR_BORDER_RADIUS,
        },
        style: {
          fill: baseColor,
        },
      },
    ];

    // Add stripe overlay if there's overflow
    const stripeOverlay = createStripeOverlay(finalWidth, barHeight, status, hasOverflowBefore, hasOverflowAfter);
    if (stripeOverlay) {
      children.push(stripeOverlay);
    }

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 8) {
      children.push({
        type: 'text',
        style: {
          text: duration,
          x: finalWidth / 2,
          y: barHeight / 2,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize: 12,
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

  // Build chart options
  function buildChartOptions(): ECOption {
    return {
      animation: false,
      grid: {
        left: 0,
        right: 0,
        top: LABELS_HEIGHT,
        bottom: 0,
        containLabel: false,
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: options.numColumns.value,
        show: false,
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        show: false,
      },
      series: [
        // Series 1: Day labels
        {
          type: 'custom',
          renderItem: renderDayLabels as unknown as CustomRenderItem,
          data: dayLabelsData.value,
          silent: true,
        },
        // Series 2: Grid background
        {
          type: 'custom',
          renderItem: renderGridBackground as unknown as CustomRenderItem,
          data: [{ value: [0] }],
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
      if (params.componentType === 'series' && params.seriesIndex === 2) {
        const data = params.data as { value: number[] };
        const barIndex = data.value?.[2];
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
      if (params.componentType === 'series' && params.seriesIndex === 2) {
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
    [options.numColumns, options.dayLabels, options.ganttBars],
    () => {
      refresh();
    },
    { deep: true },
  );

  return {
    chartInstance,
    refresh,
  };
}
