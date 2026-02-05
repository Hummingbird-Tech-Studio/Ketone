import {
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  BAR_BORDER_RADIUS,
  BAR_HEIGHT,
  BAR_PADDING_HORIZONTAL,
  BAR_PADDING_TOP,
  COLOR_BAR_TEXT,
  COLOR_BORDER,
  COLOR_COMPLETED_CYCLE,
  COLOR_COMPLETED_CYCLE_STRIPE,
  COLOR_EATING,
  COLOR_EATING_HIGHLIGHT,
  COLOR_FASTING_ACTIVE,
  COLOR_FASTING_ACTIVE_HIGHLIGHT,
  COLOR_FASTING_COMPLETED,
  COLOR_FASTING_COMPLETED_HIGHLIGHT,
  COLOR_FASTING_PLANNED,
  COLOR_FASTING_PLANNED_HIGHLIGHT,
  COLOR_TEXT,
  CURSOR_RESIZE_EW,
  getDayLabelWidth,
  HANDLE_COLOR,
  HANDLE_INSET,
  HANDLE_PILL_HEIGHT,
  HANDLE_PILL_WIDTH,
  HEADER_HEIGHT,
  MOBILE_BREAKPOINT,
  MOBILE_RESIZE_HANDLE_WIDTH,
  ROW_HEIGHT,
  TOUCH_TOOLTIP_OFFSET_Y,
  UNHOVERED_OPACITY,
} from '../constants';
import type {
  ChartDimensions,
  CompletedCycleBar,
  CurrentTimePosition,
  DragBarType,
  DragEdge,
  DragState,
  PeriodConfig,
  ResizeZone,
  TimelineBar,
} from '../types';
import { buildBaseSeries, buildMarkerData, renderLocationMarker, useChartBase } from './core';
import { addHoursToDate, formatDuration } from './useTimelineData';

// ============================================================================
// Types
// ============================================================================

export interface UseTimelineChartEditOptions {
  // Data
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<TimelineBar[]>;
  currentTimePosition: Ref<CurrentTimePosition | null>;

  // Edit mode specific
  completedCycleBars: Ref<CompletedCycleBar[]>;
  periodConfigs: Ref<PeriodConfig[]>;

  // State
  hoveredPeriodIndex: Ref<number>;
  isDragging: Ref<boolean>;
  dragPeriodIndex: Ref<number | null>;
  dragState: Ref<DragState | null>;

  // Event handlers
  onHoverPeriod: (periodIndex: number) => void;
  onHoverExit: () => void;

  // Edit mode event handlers
  onDragStart: (edge: DragEdge, barType: DragBarType, periodIndex: number, startX: number) => void;
  onDragMove: (currentX: number) => void;
  onDragEnd: () => void;
  onChartDimensionsChange: (dimensions: ChartDimensions) => void;
}

// ============================================================================
// Main Composable
// ============================================================================

export function useTimelineChartEdit(chartContainer: Ref<HTMLElement | null>, options: UseTimelineChartEditOptions) {
  // Resize zones (calculated from timeline bars)
  const resizeZones = ref<ResizeZone[]>([]);

  // Local drag state - set synchronously to block hover events and control rendering
  // (before XState state propagates reactively)
  let localDragging = false;
  let localDragPeriodIndex: number | null = null;
  let activeTouchId: number | null = null; // Track initiating touch to handle multi-touch correctly

  // Track if mouse is over completed cycle bar (for cursor handling)
  let isOverCompletedCycle = false;

  // ========================================
  // Segment Position Cache
  // ========================================

  // Cached segment positions - computed once per data change instead of per-bar per-render
  const segmentPositionCache = computed(() => {
    const cache = new Map<number, { isFirstSegment: boolean; isLastSegment: boolean }>();
    const allBars = options.timelineBars.value;

    // Group bars by periodIndex-type key
    const barGroups = new Map<string, TimelineBar[]>();
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

  /**
   * Determines if a bar is the first or last segment in its period+type group.
   * Uses pre-computed cache for O(1) lookup instead of O(N) filter + sort per call.
   */
  function getSegmentPosition(barIndex: number): { isFirstSegment: boolean; isLastSegment: boolean } {
    const cached = segmentPositionCache.value.get(barIndex);
    if (cached) return cached;
    // Fallback for safety (shouldn't happen if cache is properly maintained)
    return { isFirstSegment: false, isLastSegment: false };
  }

  // ========================================
  // Data Transformations
  // ========================================

  // Transform timeline bars to chart data format
  // Include hoveredPeriodIndex to force ECharts to re-render all bars when hover changes
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

  // Transform completed cycle bars to chart data format
  const completedCycleBarsData = computed(() => {
    return options.completedCycleBars.value.map((bar, i) => ({
      value: [bar.dayIndex, bar.startHour, bar.endHour, i],
    }));
  });

  // Marker data - include current time position values to trigger re-render
  const markerData = computed(() => buildMarkerData(options.currentTimePosition));

  // ========================================
  // Drag Tooltip
  // ========================================

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

  function formatDragTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  // ========================================
  // Resize Zones
  // ========================================

  // Calculate resize zones from timeline bars
  function calculateResizeZones(chartWidth: number): ResizeZone[] {
    const zones: ResizeZone[] = [];
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;
    // Use consistent handle width across all viewports for better UX
    const handleWidth = MOBILE_RESIZE_HANDLE_WIDTH;

    const allBars = options.timelineBars.value;

    for (let i = 0; i < allBars.length; i++) {
      const bar = allBars[i]!;
      const { isFirstSegment, isLastSegment } = getSegmentPosition(i);

      // Calculate bar position (same logic as renderTimelineBar)
      const barX = dayLabelWidth + (bar.startHour / 24) * gridWidth;
      const barWidth = ((bar.endHour - bar.startHour) / 24) * gridWidth;
      const barY = HEADER_HEIGHT + bar.dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

      // Left edge zone (only for first segment of this bar type in the period)
      if (isFirstSegment) {
        zones.push({
          x: barX - handleWidth / 2,
          y: barY,
          width: handleWidth,
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
          x: barX + barWidth - handleWidth / 2,
          y: barY,
          width: handleWidth,
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

  // ========================================
  // Bar Color Utilities
  // ========================================

  function getBarColor(barType: 'fasting' | 'eating', state: string, highlighted: boolean): string {
    if (barType === 'eating') {
      return highlighted ? COLOR_EATING_HIGHLIGHT : COLOR_EATING;
    }

    // Fasting bar - color based on state
    switch (state) {
      case 'completed':
        return highlighted ? COLOR_FASTING_COMPLETED_HIGHLIGHT : COLOR_FASTING_COMPLETED;
      case 'in_progress':
        return highlighted ? COLOR_FASTING_ACTIVE_HIGHLIGHT : COLOR_FASTING_ACTIVE;
      case 'scheduled':
      default:
        return highlighted ? COLOR_FASTING_PLANNED_HIGHLIGHT : COLOR_FASTING_PLANNED;
    }
  }

  // ========================================
  // Render Functions
  // ========================================

  /**
   * Render drag handle (pill/capsule shape).
   * Creates a visual indicator showing where users can drag to resize periods.
   * Similar to iOS sheet drag handles.
   */
  function renderDragHandle(position: 'left' | 'right' | 'center-left', barWidth: number): RenderItemReturn[] {
    // Position X of handle based on position type
    let handleX: number;
    if (position === 'left') {
      handleX = HANDLE_INSET; // Inside left edge
    } else if (position === 'right') {
      handleX = barWidth - HANDLE_PILL_WIDTH - HANDLE_INSET; // Inside right edge
    } else {
      // 'center-left': centered exactly on the left edge (intersection point)
      handleX = -HANDLE_PILL_WIDTH / 2;
    }

    // Center vertically in bar
    const handleY = (BAR_HEIGHT - HANDLE_PILL_HEIGHT) / 2;

    return [
      {
        type: 'rect',
        shape: {
          x: handleX,
          y: handleY,
          width: HANDLE_PILL_WIDTH,
          height: HANDLE_PILL_HEIGHT,
          r: HANDLE_PILL_WIDTH / 2, // Full border radius for pill shape
        },
        style: {
          fill: HANDLE_COLOR,
        },
      },
    ];
  }

  /**
   * Render function for completed cycle bars (green, with diagonal stripes only if weak spanning).
   */
  function renderCompletedCycleBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0);
    const startHour = api.value(1);
    const endHour = api.value(2);
    const barIndex = api.value(3);
    const barData = options.completedCycleBars.value[barIndex];
    const segmentDuration = barData?.segmentDuration ?? '';
    const isWeakSpanning = barData?.isWeakSpanning ?? false;

    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Calculate bar dimensions
    const barX = dayLabelWidth + (startHour / 24) * gridWidth + BAR_PADDING_HORIZONTAL;
    const barWidth = ((endHour - startHour) / 24) * gridWidth - 2 * BAR_PADDING_HORIZONTAL;
    const barY = HEADER_HEIGHT + dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;

    const finalWidth = Math.max(barWidth, 2);

    const children: RenderItemReturn[] = [
      // Base green rectangle
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
          fill: COLOR_COMPLETED_CYCLE,
        },
      },
    ];

    // Only add diagonal stripes if the cycle spans multiple days (weak spanning)
    if (isWeakSpanning) {
      const stripeWidth = 5;
      const stripes: RenderItemReturn[] = [];

      // Generate diagonal stripes across the bar
      for (let i = -BAR_HEIGHT; i < finalWidth + BAR_HEIGHT; i += stripeWidth * 2) {
        stripes.push({
          type: 'line',
          shape: {
            x1: i,
            y1: 0,
            x2: i + BAR_HEIGHT,
            y2: BAR_HEIGHT,
          },
          style: {
            stroke: COLOR_COMPLETED_CYCLE_STRIPE,
            lineWidth: 2,
          },
        });
      }

      // Clip group for stripes
      children.push({
        type: 'group',
        clipPath: {
          type: 'rect',
          shape: {
            x: 0,
            y: 0,
            width: finalWidth,
            height: BAR_HEIGHT,
            r: BAR_BORDER_RADIUS,
          },
        },
        children: stripes,
      });
    }

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 25) {
      const fontSize = chartWidth < MOBILE_BREAKPOINT ? 10 : 11;
      children.push({
        type: 'text',
        style: {
          text: segmentDuration,
          x: finalWidth / 2,
          y: BAR_HEIGHT / 2,
          textAlign: 'center',
          textVerticalAlign: 'middle',
          fontSize,
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

  /**
   * Render function for timeline bars (edit mode with drag handles).
   */
  function renderTimelineBarEdit(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
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

    // Get highlighted period (either from drag or hover)
    // Use local drag state first (synchronous) to prevent hover flashing during drag,
    // then fall back to reactive XState state
    const isDraggingNow = localDragging || options.isDragging.value;
    const highlightedPeriod = isDraggingNow
      ? (localDragPeriodIndex ?? options.dragPeriodIndex.value ?? -1)
      : options.hoveredPeriodIndex.value;

    const isHighlighted = highlightedPeriod === periodIndex;
    const hasHighlight = highlightedPeriod !== -1;

    // Determine if drag handles should be shown (on first/last segments, when hovered)
    const { isFirstSegment, isLastSegment } = getSegmentPosition(barIndex);

    // Left handle: start of period (on fasting bar)
    const showLeftHandle = isFirstSegment && !hasConnectingBarBefore && type === 'fasting' && isHighlighted;

    // Right handle: end of period (on eating bar)
    const showRightHandle = isLastSegment && !hasConnectingBarAfter && type === 'eating' && isHighlighted;

    // Middle handle: fasting/eating boundary (shown on eating bar's left edge where it connects to fasting)
    const showMiddleHandle = isFirstSegment && hasConnectingBarBeforeSameDay && type === 'eating' && isHighlighted;

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

    // Determine colors based on type, state, and hover
    let textOpacity = 1;
    let barOpacity = 1;
    let barColor: string;

    if (hasHighlight && !isHighlighted) {
      // Another period is highlighted - dim this one
      barColor = getBarColor(type, periodState, false);
      textOpacity = UNHOVERED_OPACITY;
      barOpacity = UNHOVERED_OPACITY;
    } else {
      // Normal or highlighted - use state-based colors
      barColor = getBarColor(type, periodState, isHighlighted);
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

    // Add drag handles for draggable edges
    if (showLeftHandle) {
      children.push(...renderDragHandle('left', finalWidth));
    }
    if (showMiddleHandle) {
      children.push(...renderDragHandle('center-left', finalWidth)); // Centered on fasting/eating boundary
    }
    if (showRightHandle) {
      children.push(...renderDragHandle('right', finalWidth));
    }

    // Duration label (only show if bar is wide enough)
    if (finalWidth > 25) {
      const periodConfig = options.periodConfigs.value[periodIndex];
      const phaseDurationHours = periodConfig
        ? type === 'fasting'
          ? periodConfig.fastingDuration
          : periodConfig.eatingWindow
        : 3;

      // Use smaller font for durations < 2h 45m (2.75 hours)
      const isShortDuration = phaseDurationHours < 2.75;
      const fontSize = chartWidth < MOBILE_BREAKPOINT ? (isShortDuration ? 8 : 10) : isShortDuration ? 9 : 11;

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

  // ========================================
  // Tooltip Formatting
  // ========================================

  /**
   * Format date for tooltip display (e.g., "Mon, Jan 22, 4:30PM")
   */
  function formatTooltipDate(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const dayNum = date.getDate();

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const meridiem = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes.toString();

    return `${dayName}, ${month} ${dayNum}, ${formattedHours}:${formattedMinutes}${meridiem}`;
  }

  /**
   * Format tooltip content for completed cycle bar.
   */
  function formatCompletedCycleTooltipContent(barData: CompletedCycleBar): string {
    const startFormatted = formatTooltipDate(barData.startDate);
    const endFormatted = formatTooltipDate(barData.endDate);

    return `
      <div style="line-height: 1.6; min-width: 160px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${COLOR_TEXT};">Completed Fast</div>
        <div><span style="font-weight: 500;">Total Fast Duration:</span> ${barData.totalDuration}</div>
        <div><span style="font-weight: 500;">Start:</span> ${startFormatted}</div>
        <div><span style="font-weight: 500;">End:</span> ${endFormatted}</div>
      </div>
    `;
  }

  /**
   * Format tooltip content for period info (edit mode with PeriodConfig).
   */
  function formatTooltipContentEditMode(barData: TimelineBar): string {
    const periodConfig = options.periodConfigs.value[barData.periodIndex];
    if (!periodConfig) return '';

    const fastingHours = periodConfig.fastingDuration;
    const eatingHours = periodConfig.eatingWindow;
    const totalHours = fastingHours + eatingHours;

    // Period number is 1-indexed
    const periodNumber = barData.periodIndex + 1;

    // Determine phase-specific info based on bar type
    const isFasting = barData.type === 'fasting';
    const phaseLabel = isFasting ? 'Fast' : 'Eating Window';
    const phaseDuration = isFasting ? fastingHours : eatingHours;

    // Calculate start time for the specific phase
    const phaseStartTime = isFasting
      ? periodConfig.startTime
      : new Date(periodConfig.startTime.getTime() + fastingHours * 60 * 60 * 1000);

    const formattedStartDate = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(phaseStartTime);

    return `
      <div style="line-height: 1.6; min-width: 160px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${COLOR_TEXT};">Period ${periodNumber} - ${phaseLabel}</div>
        <div><span style="font-weight: 500;">Start:</span> ${formattedStartDate}</div>
        <div><span style="font-weight: 500;">Duration:</span> ${formatDuration(phaseDuration)}</div>
        <div style="border-top: 1px solid #eee; margin-top: 4px; padding-top: 4px;">
          <span style="font-weight: 600;">Period Duration:</span> ${formatDuration(totalHours)}
        </div>
      </div>
    `;
  }

  // ========================================
  // Chart Options Builder
  // ========================================

  function buildChartOptions(): ECOption {
    // Disable tooltip during drag to prevent interference
    const isDraggingNow = localDragging || options.isDragging.value;

    const { renderHourLabels, renderGridBackground } = buildBaseSeries({
      numRows: options.numRows,
      hourLabels: options.hourLabels,
      hourPositions: options.hourPositions,
      parsedDayLabels: parsedDayLabels,
    });

    // Build hour labels data
    const hourLabelsData = options.hourLabels.value.map((_, i) => ({ value: [i] }));

    const series: ECOption['series'] = [
      // Series 0: Hour labels header
      {
        type: 'custom' as const,
        renderItem: renderHourLabels as unknown as CustomRenderItem,
        data: hourLabelsData,
        silent: true,
        z: 1,
      },
      // Series 1: Grid background with day labels
      {
        type: 'custom' as const,
        renderItem: renderGridBackground as unknown as CustomRenderItem,
        data: [{ value: [0] }],
        silent: true,
        z: 2,
      },
      // Series 2: Completed cycle bars (interactive for tooltip/hover)
      {
        type: 'custom',
        renderItem: renderCompletedCycleBar as unknown as CustomRenderItem,
        data: completedCycleBarsData.value,
        z: 5,
      },
      // Series 3: Timeline bars (silent during drag to prevent ECharts internal effects)
      {
        type: 'custom',
        renderItem: renderTimelineBarEdit as unknown as CustomRenderItem,
        data: timelineBarsData.value,
        silent: isDraggingNow,
        z: 10,
      },
      // Series 4: Location marker (rendered last to be on top)
      {
        id: 'marker',
        type: 'custom',
        renderItem: renderLocationMarker as unknown as CustomRenderItem,
        data: markerData.value,
        silent: true,
        z: 100,
      },
    ];

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

              // Series 2: Completed cycle bars
              if (p.seriesIndex === 2) {
                const barIndex = p.data?.value?.[3];
                if (barIndex === undefined) return '';
                const bar = options.completedCycleBars.value[barIndex];
                if (!bar) return '';
                return formatCompletedCycleTooltipContent(bar);
              }

              // Series 3: Timeline bars (period bars)
              if (p.seriesIndex === 3) {
                const barIndex = p.data?.value?.[3];
                if (barIndex === undefined) return '';
                const bar = options.timelineBars.value[barIndex];
                if (!bar) return '';
                return formatTooltipContentEditMode(bar);
              }

              return '';
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
      series,
    };
  }

  // ========================================
  // Chart Base Setup
  // ========================================

  const { chartInstance, chartHeight, parsedDayLabels, refresh } = useChartBase({
    chartContainer,
    numRows: options.numRows,
    dayLabels: options.dayLabels,
    buildChartOptions,
    onResize: () => {
      // Recalculate resize zones and update dimensions when chart resizes
      if (!chartInstance.value) return;
      const chartWidth = chartInstance.value.getWidth();
      resizeZones.value = calculateResizeZones(chartWidth);

      const dayLabelWidth = getDayLabelWidth(chartWidth);
      options.onChartDimensionsChange({
        width: chartWidth,
        dayLabelWidth,
        gridWidth: chartWidth - dayLabelWidth,
      });
    },
  });

  // ========================================
  // Event Handlers
  // ========================================

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
    } else if (isOverCompletedCycle) {
      // Keep pointer cursor when over completed cycle bar
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

  // Global mousemove handler - allows drag to continue even when mouse leaves the chart container
  function globalMouseMove(event: MouseEvent) {
    if (!localDragging && !options.isDragging.value) return;

    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = event.clientX - rect.left;
    options.onDragMove(offsetX);

    // Show drag tooltip with current time
    const state = options.dragState.value;
    if (state) {
      const timeStr = calculateDragTime(state);
      showDragTooltip(event.clientX, event.clientY, timeStr);
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

  // ========================================
  // Chart Initialization with Event Handlers
  // ========================================

  function setupEventHandlers() {
    if (!chartContainer.value || !chartInstance.value) return;

    // Remove any existing listeners before adding new ones
    chartContainer.value.removeEventListener('mousemove', onContainerMouseMove);
    chartContainer.value.removeEventListener('mousedown', onContainerMouseDown);
    chartContainer.value.removeEventListener('mouseup', onContainerMouseUp);
    chartContainer.value.removeEventListener('touchstart', onContainerTouchStart);
    chartContainer.value.removeEventListener('touchmove', onContainerTouchMove);
    chartContainer.value.removeEventListener('touchend', onContainerTouchEnd);
    chartContainer.value.removeEventListener('touchcancel', onContainerTouchCancel);
    document.removeEventListener('mousemove', globalMouseMove);
    document.removeEventListener('mouseup', globalMouseUp);
    document.removeEventListener('touchend', globalTouchEnd);
    document.removeEventListener('touchcancel', globalTouchEnd);

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

    // Global mouse/touch handlers for when pointer leaves chart during drag
    document.addEventListener('mousemove', globalMouseMove);
    document.addEventListener('mouseup', globalMouseUp);
    document.addEventListener('touchend', globalTouchEnd);
    document.addEventListener('touchcancel', globalTouchEnd);

    // Set up hover event handlers for period highlighting
    chartInstance.value.on('mouseover', { seriesIndex: 3 }, (params: unknown) => {
      // Don't update hover state during drag - check both local flag and XState state
      if (localDragging || options.isDragging.value) return;

      const p = params as { data: { value: number[] } };
      const periodIndex = p.data?.value?.[4];
      if (periodIndex !== undefined && periodIndex !== options.hoveredPeriodIndex.value) {
        options.onHoverPeriod(periodIndex);
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 3 }, () => {
      // Don't clear hover state during drag - check both local flag and XState state
      if (localDragging || options.isDragging.value) return;

      options.onHoverExit();
    });

    // Set up cursor change for completed cycle bars (series 2)
    chartInstance.value.on('mouseover', (params: unknown) => {
      const p = params as { componentType: string; seriesIndex: number };
      if (p.componentType === 'series' && p.seriesIndex === 2) {
        isOverCompletedCycle = true;
        updateCursor('pointer');
      }
    });

    chartInstance.value.on('mouseout', (params: unknown) => {
      const p = params as { componentType: string; seriesIndex: number };
      if (p.componentType === 'series' && p.seriesIndex === 2) {
        isOverCompletedCycle = false;
        updateCursor('default');
      }
    });
  }

  // Re-initialize event handlers when chart becomes available
  watch(
    () => chartInstance.value,
    (instance) => {
      if (instance) {
        setupEventHandlers();
      }
    },
  );

  // ========================================
  // Cleanup
  // ========================================

  onUnmounted(() => {
    document.removeEventListener('mousemove', globalMouseMove);
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

  // ========================================
  // Watchers
  // ========================================

  watch(
    [options.numRows, options.dayLabels, options.timelineBars, () => options.completedCycleBars.value],
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
  watch([options.hoveredPeriodIndex, () => options.isDragging.value], () => {
    if (localDragging || options.isDragging.value) return;
    if (chartInstance.value) {
      // Force complete re-render by clearing and rebuilding
      chartInstance.value.clear();
      chartInstance.value.setOption(buildChartOptions());
    }
  });

  // Watch for marker position changes - only update the marker series data
  // Skip during drag to prevent interference with drag operations
  watch(
    options.currentTimePosition,
    () => {
      if (!chartInstance.value) return;
      // Skip marker updates while dragging or hovering to prevent tooltip/highlight interference
      if (localDragging || options.isDragging.value) return;
      if (options.hoveredPeriodIndex.value !== -1) return;
      // Only update the marker series without touching other series
      chartInstance.value.setOption({
        series: [{ id: 'marker', data: markerData.value }],
      });
    },
    { deep: true },
  );

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
