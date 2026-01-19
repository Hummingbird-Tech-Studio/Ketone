import { useChartLifecycle } from '@/views/statistics/StatisticsChart/composables/chart/lifecycle';
import {
  echarts,
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import { computed, onUnmounted, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import type { ChartDimensions } from '../actors/planTimeline.actor';
import type { DragBarType, DragEdge, DragState, PeriodConfig, ResizeZone, TimelineBar } from '../types';
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
  CURSOR_RESIZE_EW,
  DAY_LABEL_WIDTH_DESKTOP,
  DAY_LABEL_WIDTH_MOBILE,
  GRID_BORDER_RADIUS,
  HEADER_HEIGHT,
  MOBILE_BREAKPOINT,
  RESIZE_HANDLE_WIDTH,
  ROW_HEIGHT,
  TOUCH_TOOLTIP_OFFSET_Y,
} from './chart/constants';

// Highlight colors (slightly darker/more saturated)
const COLOR_FASTING_HIGHLIGHT = '#4a8ac4';
const COLOR_EATING_HIGHLIGHT = '#e5a070';
const UNHOVERED_OPACITY = 0.4;

interface UsePlanTimelineChartOptions {
  // Data
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<TimelineBar[]>;
  periodConfigs: Ref<PeriodConfig[]>;

  // State from machine (passed from composable)
  hoveredPeriodIndex: Ref<number>;
  isDragging: Ref<boolean>;
  dragPeriodIndex: Ref<number | null>;
  dragState: Ref<DragState | null>;

  // Event dispatchers to machine
  onHoverPeriod: (periodIndex: number) => void;
  onHoverExit: () => void;
  onDragStart: (edge: DragEdge, barType: DragBarType, periodIndex: number, startX: number) => void;
  onDragMove: (currentX: number) => void;
  onDragEnd: () => void;
  onChartDimensionsChange: (dimensions: ChartDimensions) => void;
}

function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}

export function usePlanTimelineChart(chartContainer: Ref<HTMLElement | null>, options: UsePlanTimelineChartOptions) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Resize zones (calculated from timeline bars)
  const resizeZones = ref<ResizeZone[]>([]);

  // Local drag state - set synchronously to block hover events and control rendering
  // (before XState state propagates reactively)
  let localDragging = false;
  let localDragPeriodIndex: number | null = null;
  let activeTouchId: number | null = null; // Track initiating touch to handle multi-touch correctly

  // Drag tooltip element
  let dragTooltip: HTMLDivElement | null = null;

  function createDragTooltip() {
    if (dragTooltip) return;
    dragTooltip = document.createElement('div');
    dragTooltip.style.cssText = `
      position: fixed;
      padding: 6px 10px;
      background: #fff;
      border: 1px solid ${COLOR_BORDER};
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      color: ${COLOR_TEXT};
      pointer-events: none;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      display: none;
      white-space: nowrap;
    `;
    document.body.appendChild(dragTooltip);
  }

  function removeDragTooltip() {
    if (dragTooltip) {
      dragTooltip.remove();
      dragTooltip = null;
    }
  }

  function showDragTooltip(clientX: number, clientY: number, content: string) {
    if (!dragTooltip) createDragTooltip();
    if (!dragTooltip) return;

    dragTooltip.textContent = content;
    dragTooltip.style.display = 'block';
    // Position above and to the right of cursor
    dragTooltip.style.left = `${clientX + 15}px`;
    dragTooltip.style.top = `${clientY - 30}px`;
  }

  function hideDragTooltip() {
    if (dragTooltip) {
      dragTooltip.style.display = 'none';
    }
  }

  /**
   * Calculate the time being modified during drag based on edge and bar type.
   * Returns formatted time string.
   */
  function calculateDragTime(state: DragState): string {
    const { edge, barType, originalStartTime, originalFastingDuration, originalEatingWindow, hourDelta } = state;

    let targetTime: Date;

    if (barType === 'fasting' && edge === 'left') {
      // Dragging period start time
      targetTime = addHoursToDate(originalStartTime, hourDelta);
    } else if (barType === 'fasting' && edge === 'right') {
      // Dragging fasting→eating boundary
      targetTime = addHoursToDate(originalStartTime, originalFastingDuration + hourDelta);
    } else if (barType === 'eating' && edge === 'left') {
      // Dragging fasting→eating boundary (same as fasting right)
      targetTime = addHoursToDate(originalStartTime, originalFastingDuration + hourDelta);
    } else {
      // eating right edge - dragging period end time
      targetTime = addHoursToDate(originalStartTime, originalFastingDuration + originalEatingWindow + hourDelta);
    }

    return formatDragTime(targetTime);
  }

  function addHoursToDate(date: Date, hours: number): Date {
    const newDate = new Date(date);
    const millisToAdd = hours * 60 * 60 * 1000;
    newDate.setTime(newDate.getTime() + millisToAdd);
    return newDate;
  }

  function formatDragTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  // Calculate resize zones from timeline bars
  function calculateResizeZones(chartWidth: number): ResizeZone[] {
    const zones: ResizeZone[] = [];
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Group bars by period AND type to find first/last segments for multi-day periods
    const barsByPeriodAndType = new Map<string, TimelineBar[]>();
    for (const bar of options.timelineBars.value) {
      const key = `${bar.periodIndex}-${bar.type}`;
      const existing = barsByPeriodAndType.get(key) || [];
      existing.push(bar);
      barsByPeriodAndType.set(key, existing);
    }

    for (const bar of options.timelineBars.value) {
      const key = `${bar.periodIndex}-${bar.type}`;
      const typeBars = barsByPeriodAndType.get(key) || [];
      const sortedBars = [...typeBars].sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.startHour - b.startHour;
      });

      const isFirstSegment = sortedBars[0] === bar;
      const isLastSegment = sortedBars[sortedBars.length - 1] === bar;

      // Calculate bar position (same logic as renderTimelineBar)
      const barX = dayLabelWidth + (bar.startHour / 24) * gridWidth;
      const barWidth = ((bar.endHour - bar.startHour) / 24) * gridWidth;
      const barY = HEADER_HEIGHT + bar.dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

      // Left edge zone (only for first segment of this bar type in the period)
      if (isFirstSegment) {
        zones.push({
          x: barX - RESIZE_HANDLE_WIDTH / 2,
          y: barY,
          width: RESIZE_HANDLE_WIDTH,
          height: BAR_HEIGHT,
          edge: 'left',
          barType: bar.type,
          periodIndex: bar.periodIndex,
          bar,
        });
      }

      // Right edge zone (only for last segment of this bar type in the period)
      if (isLastSegment) {
        zones.push({
          x: barX + barWidth - RESIZE_HANDLE_WIDTH / 2,
          y: barY,
          width: RESIZE_HANDLE_WIDTH,
          height: BAR_HEIGHT,
          edge: 'right',
          barType: bar.type,
          periodIndex: bar.periodIndex,
          bar,
        });
      }
    }

    return zones;
  }

  // Hit test for resize zone - prioritize zones for the currently hovered period
  function findResizeZone(mouseX: number, mouseY: number): ResizeZone | null {
    const matchingZones: ResizeZone[] = [];

    for (const zone of resizeZones.value) {
      if (mouseX >= zone.x && mouseX <= zone.x + zone.width && mouseY >= zone.y && mouseY <= zone.y + zone.height) {
        matchingZones.push(zone);
      }
    }

    if (matchingZones.length === 0) return null;
    if (matchingZones.length === 1) return matchingZones[0]!;

    // If multiple zones match (overlapping edges), prioritize the hovered period
    if (options.hoveredPeriodIndex.value !== -1) {
      const hoveredZone = matchingZones.find((z) => z.periodIndex === options.hoveredPeriodIndex.value);
      if (hoveredZone) return hoveredZone;
    }

    // Fallback: prefer eating bar edges over fasting bar edges (user more likely resizing eating)
    const eatingZone = matchingZones.find((z) => z.barType === 'eating');
    if (eatingZone) return eatingZone;

    return matchingZones[0]!;
  }

  // Update cursor on container and canvas
  function updateCursor(cursor: string) {
    if (chartContainer.value) {
      chartContainer.value.style.cursor = cursor;
      // Also apply to canvas element inside the container
      const canvas = chartContainer.value.querySelector('canvas');
      if (canvas) {
        canvas.style.cursor = cursor;
      }
    }
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

  // Render function for timeline bars
  function renderTimelineBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0);
    const startHour = api.value(1);
    const endHour = api.value(2);
    const barIndex = api.value(3);
    const periodIndex = api.value(4);

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

    // Determine colors based on type and hover state (using state from machine)
    let barColor: string;
    let textOpacity = 1;
    let barOpacity = 1;

    // Get highlighted period (either from drag or hover)
    // Use local drag state first (synchronous) to prevent hover flashing during drag,
    // then fall back to reactive XState state
    const isDraggingNow = localDragging || options.isDragging.value;
    const highlightedPeriod = isDraggingNow
      ? (localDragPeriodIndex ?? options.dragPeriodIndex.value ?? -1)
      : options.hoveredPeriodIndex.value;

    // Fasting/eating bar coloring
    const isHighlighted = highlightedPeriod === periodIndex;
    const hasHighlight = highlightedPeriod !== -1;

    if (hasHighlight && !isHighlighted) {
      // Another period is highlighted - dim this one
      barColor = type === 'fasting' ? COLOR_FASTING : COLOR_EATING;
      textOpacity = UNHOVERED_OPACITY;
      barOpacity = UNHOVERED_OPACITY;
    } else if (isHighlighted) {
      // This period is highlighted
      barColor = type === 'fasting' ? COLOR_FASTING_HIGHLIGHT : COLOR_EATING_HIGHLIGHT;
    } else {
      // No highlight - normal colors
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

    // Calculate visible period number (counting only non-deleted periods)
    let periodNumber = 0;
    for (let i = 0; i <= barData.periodIndex; i++) {
      const config = options.periodConfigs.value[i];
      if (config && !config.deleted) {
        periodNumber++;
      }
    }

    const formattedStartDate = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(periodConfig.startTime);

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
    // Disable tooltip during drag to prevent interference
    const isDraggingNow = localDragging || options.isDragging.value;

    return {
      animation: false,
      tooltip: isDraggingNow
        ? { show: false }
        : {
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
        // Series 2: Timeline bars (silent during drag to prevent ECharts internal effects)
        {
          type: 'custom',
          renderItem: renderTimelineBar as unknown as CustomRenderItem,
          data: timelineBarsData.value,
          silent: isDraggingNow,
        },
      ],
    };
  }

  // Handle hover for cursor changes
  function handleHoverForCursor(offsetX: number, offsetY: number) {
    if (localDragging || options.isDragging.value) return;

    const zone = findResizeZone(offsetX, offsetY);
    if (zone) {
      // Show resize cursor when hovering resize zone edges
      updateCursor(CURSOR_RESIZE_EW);
    } else if (options.hoveredPeriodIndex.value !== -1) {
      // Show pointer when hovering over a period bar
      updateCursor('pointer');
    } else {
      // Reset to default cursor
      updateCursor('default');
    }
  }

  // Native DOM event handlers for drag
  function onContainerMouseMove(event: MouseEvent) {
    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    if (localDragging || options.isDragging.value) {
      options.onDragMove(offsetX);

      // Show drag tooltip with current time
      const state = options.dragState.value;
      if (state) {
        const timeStr = calculateDragTime(state);
        showDragTooltip(event.clientX, event.clientY, timeStr);
      }
    } else {
      handleHoverForCursor(offsetX, offsetY);
    }
  }

  function onContainerMouseDown(event: MouseEvent) {
    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    const zone = findResizeZone(offsetX, offsetY);
    if (zone) {
      // Set local flags immediately to block hover events and control rendering
      // before XState state propagates reactively
      localDragging = true;
      localDragPeriodIndex = zone.periodIndex;
      options.onDragStart(zone.edge, zone.barType, zone.periodIndex, offsetX);
      document.body.style.userSelect = 'none';

      // Force immediate re-render with local drag state
      if (chartInstance.value) {
        chartInstance.value.setOption(buildChartOptions());
      }
    }
  }

  function onContainerMouseUp() {
    if (options.isDragging.value || localDragging) {
      localDragging = false;
      localDragPeriodIndex = null;
      options.onDragEnd();
      document.body.style.userSelect = '';
      updateCursor('default');
      hideDragTooltip();

      // Force full chart refresh to re-enable tooltip after drag
      if (chartInstance.value) {
        chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
      }
    }
  }

  // Global mouseup handler
  function globalMouseUp() {
    if (options.isDragging.value || localDragging) {
      localDragging = false;
      localDragPeriodIndex = null;
      options.onDragEnd();
      document.body.style.userSelect = '';
      updateCursor('default');
      hideDragTooltip();

      // Force full chart refresh to re-enable tooltip after drag
      if (chartInstance.value) {
        chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
      }
    }
  }

  // Touch event handlers for mobile
  function onContainerTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;

    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = touch.clientX - rect.left;
    const offsetY = touch.clientY - rect.top;

    const zone = findResizeZone(offsetX, offsetY);
    if (zone) {
      event.preventDefault(); // Prevent scroll during drag
      localDragging = true;
      localDragPeriodIndex = zone.periodIndex;
      activeTouchId = touch.identifier; // Track this touch for multi-touch safety
      options.onDragStart(zone.edge, zone.barType, zone.periodIndex, offsetX);

      if (chartInstance.value) {
        chartInstance.value.setOption(buildChartOptions());
      }
    }
  }

  function onContainerTouchMove(event: TouchEvent) {
    if (!localDragging && !options.isDragging.value) return;

    // Find the touch that initiated the drag (handles multi-touch correctly)
    const touch = Array.from(event.touches).find((t) => t.identifier === activeTouchId);
    if (!touch) return;

    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = touch.clientX - rect.left;

    event.preventDefault(); // Prevent scroll during drag
    options.onDragMove(offsetX);

    // Show tooltip (positioned above touch point)
    const state = options.dragState.value;
    if (state) {
      const timeStr = calculateDragTime(state);
      showDragTooltip(touch.clientX, touch.clientY - TOUCH_TOOLTIP_OFFSET_Y, timeStr);
    }
  }

  function cleanupTouchDrag() {
    localDragging = false;
    localDragPeriodIndex = null;
    activeTouchId = null;
    options.onDragEnd();
    hideDragTooltip();

    if (chartInstance.value) {
      chartInstance.value.setOption(buildChartOptions(), { notMerge: true });
    }
  }

  function onContainerTouchEnd() {
    if (options.isDragging.value || localDragging) {
      cleanupTouchDrag();
    }
  }

  // Handle touch interruption (system gesture, app switch, scroll takeover)
  function onContainerTouchCancel() {
    if (options.isDragging.value || localDragging) {
      cleanupTouchDrag();
    }
  }

  // Global touchend/touchcancel handler for when finger leaves chart during drag
  function globalTouchEnd() {
    if (options.isDragging.value || localDragging) {
      cleanupTouchDrag();
    }
  }

  // Initialize chart
  function initChart() {
    if (!chartContainer.value) return;

    // Dispose any existing chart on the container
    const existingChart = echarts.getInstanceByDom(chartContainer.value);
    if (existingChart) {
      existingChart.dispose();
    }

    // Remove any existing listeners before adding new ones
    chartContainer.value.removeEventListener('mousemove', onContainerMouseMove);
    chartContainer.value.removeEventListener('mousedown', onContainerMouseDown);
    chartContainer.value.removeEventListener('mouseup', onContainerMouseUp);
    chartContainer.value.removeEventListener('touchstart', onContainerTouchStart);
    chartContainer.value.removeEventListener('touchmove', onContainerTouchMove);
    chartContainer.value.removeEventListener('touchend', onContainerTouchEnd);
    chartContainer.value.removeEventListener('touchcancel', onContainerTouchCancel);
    document.removeEventListener('mouseup', globalMouseUp);
    document.removeEventListener('touchend', globalTouchEnd);
    document.removeEventListener('touchcancel', globalTouchEnd);

    chartInstance.value = echarts.init(chartContainer.value);
    chartInstance.value.setOption(buildChartOptions());

    // Calculate initial resize zones and notify machine of dimensions
    const chartWidth = chartInstance.value.getWidth();
    resizeZones.value = calculateResizeZones(chartWidth);

    const dayLabelWidth = getDayLabelWidth(chartWidth);
    options.onChartDimensionsChange({
      width: chartWidth,
      dayLabelWidth,
      gridWidth: chartWidth - dayLabelWidth,
    });

    // Add native DOM event listeners for drag functionality
    chartContainer.value.addEventListener('mousemove', onContainerMouseMove);
    chartContainer.value.addEventListener('mousedown', onContainerMouseDown);
    chartContainer.value.addEventListener('mouseup', onContainerMouseUp);

    // Touch events for mobile drag functionality
    chartContainer.value.addEventListener('touchstart', onContainerTouchStart, { passive: false });
    chartContainer.value.addEventListener('touchmove', onContainerTouchMove, { passive: false });
    chartContainer.value.addEventListener('touchend', onContainerTouchEnd);
    chartContainer.value.addEventListener('touchcancel', onContainerTouchCancel);

    // Global mouseup/touchend/touchcancel for when pointer leaves chart during drag
    document.addEventListener('mouseup', globalMouseUp);
    document.addEventListener('touchend', globalTouchEnd);
    document.addEventListener('touchcancel', globalTouchEnd);

    // Set up hover event handlers for period highlighting
    chartInstance.value.on('mouseover', { seriesIndex: 2 }, (params: unknown) => {
      // Don't update hover state during drag - check both local flag and XState state
      if (localDragging || options.isDragging.value) return;

      const p = params as { data: { value: number[] } };
      const periodIndex = p.data?.value?.[4];
      if (periodIndex !== undefined && periodIndex !== options.hoveredPeriodIndex.value) {
        options.onHoverPeriod(periodIndex);
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 2 }, () => {
      // Don't clear hover state during drag - check both local flag and XState state
      if (localDragging || options.isDragging.value) return;

      options.onHoverExit();
    });
  }

  // Cleanup event listeners
  onUnmounted(() => {
    document.removeEventListener('mouseup', globalMouseUp);
    document.removeEventListener('touchend', globalTouchEnd);
    document.removeEventListener('touchcancel', globalTouchEnd);
    if (chartContainer.value) {
      chartContainer.value.removeEventListener('mousemove', onContainerMouseMove);
      chartContainer.value.removeEventListener('mousedown', onContainerMouseDown);
      chartContainer.value.removeEventListener('mouseup', onContainerMouseUp);
      chartContainer.value.removeEventListener('touchstart', onContainerTouchStart);
      chartContainer.value.removeEventListener('touchmove', onContainerTouchMove);
      chartContainer.value.removeEventListener('touchend', onContainerTouchEnd);
      chartContainer.value.removeEventListener('touchcancel', onContainerTouchCancel);
    }
    removeDragTooltip();
  });

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
      if (!chartInstance.value) return;

      // During drag, use lightweight update (merge mode) to prevent flashing
      // Outside drag, use full refresh (notMerge) for complete updates
      if (localDragging || options.isDragging.value) {
        chartInstance.value.setOption(buildChartOptions(), { notMerge: false, lazyUpdate: true });
      } else {
        refresh();
      }

      // Recalculate resize zones and update dimensions after refresh
      const chartWidth = chartInstance.value.getWidth();
      resizeZones.value = calculateResizeZones(chartWidth);

      const dayLabelWidth = getDayLabelWidth(chartWidth);
      options.onChartDimensionsChange({
        width: chartWidth,
        dayLabelWidth,
        gridWidth: chartWidth - dayLabelWidth,
      });
    },
    { deep: true },
  );

  // Watch for hover/drag state changes to update bar highlighting
  // Skip during drag - the data watch already handles updates and we don't want extra re-renders
  watch([options.hoveredPeriodIndex, options.isDragging], () => {
    if (localDragging || options.isDragging.value) return;
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
