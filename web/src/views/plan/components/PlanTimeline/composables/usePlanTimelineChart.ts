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
import type { DragBarType, DragEdge, DragState, GapInfo, PeriodConfig, PeriodUpdate, ResizeZone, TimelineBar } from '../types';
import {
  BAR_BORDER_RADIUS,
  BAR_HEIGHT,
  BAR_PADDING_HORIZONTAL,
  BAR_PADDING_TOP,
  COLOR_BAR_TEXT,
  COLOR_BORDER,
  COLOR_EATING,
  COLOR_FASTING,
  COLOR_GAP,
  COLOR_TEXT,
  CURSOR_RESIZE_EW,
  DAY_LABEL_WIDTH_DESKTOP,
  DAY_LABEL_WIDTH_MOBILE,
  GRID_BORDER_RADIUS,
  HEADER_HEIGHT,
  MOBILE_BREAKPOINT,
  RESIZE_HANDLE_WIDTH,
  ROW_HEIGHT,
} from './chart/constants';

// Highlight colors (slightly darker/more saturated)
const COLOR_FASTING_HIGHLIGHT = '#4a8ac4';
const COLOR_EATING_HIGHLIGHT = '#e5a070';
const COLOR_GAP_HIGHLIGHT = '#9a9a9a';
const UNHOVERED_OPACITY = 0.4;

interface UsePlanTimelineChartOptions {
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<TimelineBar[]>;
  periodConfigs: Ref<PeriodConfig[]>;
  onPeriodClick?: (periodIndex: number) => void;
  onGapClick?: (gapInfo: GapInfo) => void;
  onPeriodDrag?: (updates: PeriodUpdate[]) => void;
}

function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}

export function usePlanTimelineChart(chartContainer: Ref<HTMLElement | null>, options: UsePlanTimelineChartOptions) {
  const chartInstance: ShallowRef<echarts.ECharts | null> = shallowRef(null);

  // Track which period is currently hovered (-1 = none)
  const hoveredPeriodIndex = ref(-1);
  // Track which gap is currently hovered (null = none)
  const hoveredGapKey = ref<string | null>(null);

  // Drag state
  const dragState = ref<DragState | null>(null);
  const resizeZones = ref<ResizeZone[]>([]);

  // Calculate resize zones from timeline bars
  function calculateResizeZones(chartWidth: number): ResizeZone[] {
    const zones: ResizeZone[] = [];
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Group bars by period AND type to find first/last segments for multi-day periods
    const barsByPeriodAndType = new Map<string, TimelineBar[]>();
    for (const bar of options.timelineBars.value) {
      if (bar.type === 'gap') continue;
      const key = `${bar.periodIndex}-${bar.type}`;
      const existing = barsByPeriodAndType.get(key) || [];
      existing.push(bar);
      barsByPeriodAndType.set(key, existing);
    }

    for (const bar of options.timelineBars.value) {
      if (bar.type === 'gap') continue;

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
          barType: bar.type as DragBarType,
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
          barType: bar.type as DragBarType,
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
      if (
        mouseX >= zone.x &&
        mouseX <= zone.x + zone.width &&
        mouseY >= zone.y &&
        mouseY <= zone.y + zone.height
      ) {
        matchingZones.push(zone);
      }
    }

    if (matchingZones.length === 0) return null;
    if (matchingZones.length === 1) return matchingZones[0]!;

    // If multiple zones match (overlapping edges), prioritize the hovered period
    if (hoveredPeriodIndex.value !== -1) {
      const hoveredZone = matchingZones.find((z) => z.periodIndex === hoveredPeriodIndex.value);
      if (hoveredZone) return hoveredZone;
    }

    // Fallback: prefer eating bar edges over fasting bar edges (user more likely resizing eating)
    const eatingZone = matchingZones.find((z) => z.barType === 'eating');
    if (eatingZone) return eatingZone;

    return matchingZones[0]!;
  }

  // Convert pixel delta to hours
  function pixelsToHours(pixelDelta: number, gridWidth: number): number {
    const hoursPerPixel = 24 / gridWidth;
    return Math.round(pixelDelta * hoursPerPixel);
  }

  // Find previous non-deleted period index
  function findPreviousNonDeletedPeriodIndex(periodIndex: number): number {
    for (let i = periodIndex - 1; i >= 0; i--) {
      const config = options.periodConfigs.value[i];
      if (config && !config.deleted) return i;
    }
    return -1;
  }

  // Find next non-deleted period index
  function findNextNonDeletedPeriodIndex(periodIndex: number): number {
    for (let i = periodIndex + 1; i < options.periodConfigs.value.length; i++) {
      const config = options.periodConfigs.value[i];
      if (config && !config.deleted) return i;
    }
    return -1;
  }

  // Apply drag delta and return updates for affected periods (uses original values from dragState)
  function applyDragDelta(
    periodIndex: number,
    edge: DragEdge,
    barType: DragBarType,
    hourDelta: number,
  ): PeriodUpdate[] | null {
    if (!dragState.value) return null;

    // Use original values from drag start to avoid cumulative errors
    const originalStartTime = dragState.value.originalStartTime;
    const originalFastingDuration = dragState.value.originalFastingDuration;
    const originalEatingWindow = dragState.value.originalEatingWindow;

    // Use stored previous period values from drag start
    const prevPeriodIndex = dragState.value.prevPeriodIndex;
    const originalPrevEatingWindow = dragState.value.originalPrevEatingWindow;
    const hasPrevPeriod = prevPeriodIndex !== -1;

    // Use stored next period values from drag start
    const nextPeriodIndex = dragState.value.nextPeriodIndex;
    const originalNextFastingDuration = dragState.value.originalNextFastingDuration;
    const hasNextPeriod = nextPeriodIndex !== -1;

    if (barType === 'fasting' && edge === 'left') {
      // Adjust startTime, keep fasting end fixed by adjusting fastingDuration
      const newStartTime = new Date(originalStartTime);
      newStartTime.setHours(newStartTime.getHours() + hourDelta);
      const newFastingDuration = originalFastingDuration - hourDelta;

      // Constraints
      if (newFastingDuration < 1) return null;

      // If there's a previous period, shrink/grow its eating window to compensate
      if (hasPrevPeriod) {
        // hourDelta < 0 means fasting grows (start moves earlier), prev eating shrinks
        // hourDelta > 0 means fasting shrinks (start moves later), prev eating grows
        const prevNewEating = originalPrevEatingWindow + hourDelta;

        // Constraint: prev period eating must stay >= 1 and <= 24
        if (prevNewEating < 1) return null;
        if (prevNewEating > 24) return null;

        return [
          {
            periodIndex: prevPeriodIndex,
            changes: { eatingWindow: prevNewEating },
          },
          {
            periodIndex,
            changes: { startTime: newStartTime, fastingDuration: newFastingDuration },
          },
        ];
      }

      return [{ periodIndex, changes: { startTime: newStartTime, fastingDuration: newFastingDuration } }];
    }

    if (barType === 'fasting' && edge === 'right') {
      // Move fasting/eating boundary within the same period (doesn't affect other periods)
      // Dragging right: fasting grows, eating shrinks
      // Dragging left: fasting shrinks, eating grows
      const newFastingDuration = originalFastingDuration + hourDelta;
      const newEatingWindow = originalEatingWindow - hourDelta;

      // Constraints
      if (newFastingDuration < 1 || newEatingWindow < 1) return null;
      if (newFastingDuration > 168 || newEatingWindow > 24) return null;

      return [{ periodIndex, changes: { fastingDuration: newFastingDuration, eatingWindow: newEatingWindow } }];
    }

    if (barType === 'eating' && edge === 'left') {
      // Move fasting/eating boundary (doesn't affect other periods)
      const newFastingDuration = originalFastingDuration + hourDelta;
      const newEatingWindow = originalEatingWindow - hourDelta;

      // Constraints
      if (newFastingDuration < 1 || newEatingWindow < 1) return null;
      if (newFastingDuration > 168 || newEatingWindow > 24) return null;

      return [{ periodIndex, changes: { fastingDuration: newFastingDuration, eatingWindow: newEatingWindow } }];
    }

    if (barType === 'eating' && edge === 'right') {
      // Adjust eatingWindow - propagate to next period
      const newEatingWindow = originalEatingWindow + hourDelta;

      // Constraints for current period
      if (newEatingWindow < 1) return null;
      if (newEatingWindow > 24) return null;

      // Calculate new period end time
      const newPeriodEndTime = new Date(originalStartTime);
      newPeriodEndTime.setHours(newPeriodEndTime.getHours() + originalFastingDuration + newEatingWindow);

      // If there's a next period, propagate the change
      if (hasNextPeriod) {
        // Use original next period fasting from drag start to avoid cumulative errors
        // hourDelta > 0 means eating grows, next fasting shrinks
        // hourDelta < 0 means eating shrinks, next fasting grows
        const nextNewFasting = originalNextFastingDuration - hourDelta;

        // Constraint: next period fasting must stay >= 1
        if (nextNewFasting < 1) return null;

        return [
          { periodIndex, changes: { eatingWindow: newEatingWindow } },
          {
            periodIndex: nextPeriodIndex,
            changes: {
              startTime: newPeriodEndTime,
              fastingDuration: nextNewFasting,
            },
          },
        ];
      }

      // No next period - just update current period (last period case)
      return [{ periodIndex, changes: { eatingWindow: newEatingWindow } }];
    }

    return null;
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

    const { gapInfo } = barData;
    const isGap = type === 'gap';

    // Determine colors based on type and hover state
    let barColor: string;
    let textOpacity = 1;
    let barOpacity = 1;

    if (isGap) {
      // Gap bar coloring
      const gapKey = gapInfo ? `${gapInfo.afterPeriodIndex}-${gapInfo.beforePeriodIndex}` : '';
      const isGapHovered = hoveredGapKey.value === gapKey;

      if (isGapHovered) {
        barColor = COLOR_GAP_HIGHLIGHT;
      } else {
        barColor = COLOR_GAP;
      }
      barOpacity = 0.7;
    } else {
      // Existing fasting/eating coloring logic
      const isHovered = hoveredPeriodIndex.value === periodIndex;
      const hasHover = hoveredPeriodIndex.value !== -1;

      if (hasHover && !isHovered) {
        // Another period is hovered - dim this one
        barColor = type === 'fasting' ? COLOR_FASTING : COLOR_EATING;
        textOpacity = UNHOVERED_OPACITY;
        barOpacity = UNHOVERED_OPACITY;
      } else if (isHovered) {
        // This period is hovered - highlight
        barColor = type === 'fasting' ? COLOR_FASTING_HIGHLIGHT : COLOR_EATING_HIGHLIGHT;
      } else {
        // No hover - normal colors
        barColor = type === 'fasting' ? COLOR_FASTING : COLOR_EATING;
      }
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

  // Format tooltip content for gap bars
  function formatGapTooltipContent(barData: TimelineBar): string {
    if (!barData.gapInfo) return '';

    // Calculate total gap duration from all gap bars with the same gapInfo
    const gapKey = `${barData.gapInfo.afterPeriodIndex}-${barData.gapInfo.beforePeriodIndex}`;
    let totalHours = 0;
    options.timelineBars.value.forEach((bar) => {
      if (bar.type === 'gap' && bar.gapInfo) {
        const barGapKey = `${bar.gapInfo.afterPeriodIndex}-${bar.gapInfo.beforePeriodIndex}`;
        if (barGapKey === gapKey) {
          totalHours += bar.endHour - bar.startHour;
        }
      }
    });

    return `
      <div style="line-height: 1.6; min-width: 120px;">
        <div style="font-weight: 600; margin-bottom: 4px; color: ${COLOR_TEXT};">Rest period</div>
        <div><span style="font-weight: 500;">Total Duration:</span> ${Math.round(totalHours)}h</div>
        <div style="font-size: 11px; color: #888; margin-top: 4px;">
          Click to add a period
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
          // Use different formatter for gaps
          if (bar.type === 'gap') {
            return formatGapTooltipContent(bar);
          }
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

  // Track if drag occurred (to prevent click after drag)
  let dragOccurred = false;

  // Handle drag start
  function handleDragStart(offsetX: number, offsetY: number) {
    const zone = findResizeZone(offsetX, offsetY);
    if (!zone) return;

    const config = options.periodConfigs.value[zone.periodIndex];
    if (!config) return;

    // Find previous and next periods for propagation
    const prevPeriodIdx = findPreviousNonDeletedPeriodIndex(zone.periodIndex);
    const prevConfig = prevPeriodIdx !== -1 ? options.periodConfigs.value[prevPeriodIdx] : null;
    const nextPeriodIdx = findNextNonDeletedPeriodIndex(zone.periodIndex);
    const nextConfig = nextPeriodIdx !== -1 ? options.periodConfigs.value[nextPeriodIdx] : null;

    // Store original values at drag start to avoid cumulative errors
    dragState.value = {
      isDragging: true,
      edge: zone.edge,
      barType: zone.barType,
      periodIndex: zone.periodIndex,
      startX: offsetX,
      hourDelta: 0,
      originalStartTime: new Date(config.startTime),
      originalFastingDuration: config.fastingDuration,
      originalEatingWindow: config.eatingWindow,
      // Store previous period's original values for propagation
      prevPeriodIndex: prevPeriodIdx,
      originalPrevFastingDuration: prevConfig?.fastingDuration ?? 0,
      originalPrevEatingWindow: prevConfig?.eatingWindow ?? 0,
      // Store next period's original values for propagation
      nextPeriodIndex: nextPeriodIdx,
      originalNextStartTime: nextConfig ? new Date(nextConfig.startTime) : null,
      originalNextFastingDuration: nextConfig?.fastingDuration ?? 0,
    };

    document.body.style.userSelect = 'none';
    dragOccurred = false;
  }

  // Handle drag move
  function handleDragMove(offsetX: number) {
    if (!dragState.value || !chartInstance.value) return;

    const chartWidth = chartInstance.value.getWidth();
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    const pixelDelta = offsetX - dragState.value.startX;
    const hourDelta = pixelsToHours(pixelDelta, gridWidth);

    if (hourDelta !== dragState.value.hourDelta) {
      const updates = applyDragDelta(
        dragState.value.periodIndex,
        dragState.value.edge,
        dragState.value.barType,
        hourDelta,
      );

      if (updates) {
        dragState.value.hourDelta = hourDelta;
        dragOccurred = true;

        if (options.onPeriodDrag) {
          options.onPeriodDrag(updates);
        }
      }
    }
  }

  // Handle drag end
  function handleDragEnd() {
    if (!dragState.value) return;

    dragState.value = null;
    document.body.style.userSelect = '';
    updateCursor('pointer');
  }

  // Handle hover for cursor changes
  function handleHoverForCursor(offsetX: number, offsetY: number) {
    if (dragState.value?.isDragging) return;

    const zone = findResizeZone(offsetX, offsetY);
    if (zone) {
      // Show resize cursor when hovering resize zone edges
      updateCursor(CURSOR_RESIZE_EW);
    } else {
      // Reset to pointer (default for clickable bars)
      updateCursor('pointer');
    }
  }

  // Global mouseup handler
  function globalMouseUp() {
    handleDragEnd();
  }

  // Native DOM event handlers for drag
  function onContainerMouseMove(event: MouseEvent) {
    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    if (dragState.value?.isDragging) {
      handleDragMove(offsetX);
    } else {
      handleHoverForCursor(offsetX, offsetY);
    }
  }

  function onContainerMouseDown(event: MouseEvent) {
    const rect = chartContainer.value?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    handleDragStart(offsetX, offsetY);
  }

  function onContainerMouseUp() {
    handleDragEnd();
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

    // Calculate initial resize zones
    resizeZones.value = calculateResizeZones(chartInstance.value.getWidth());

    // Add native DOM event listeners for drag functionality
    chartContainer.value.addEventListener('mousemove', onContainerMouseMove);
    chartContainer.value.addEventListener('mousedown', onContainerMouseDown);
    chartContainer.value.addEventListener('mouseup', onContainerMouseUp);

    // Global mouseup for when mouse leaves chart during drag
    document.addEventListener('mouseup', globalMouseUp);

    // Set up hover event handlers for period highlighting
    chartInstance.value.on('mouseover', { seriesIndex: 2 }, (params: unknown) => {
      // Don't update hover state during drag - keep the dragged period highlighted
      if (dragState.value?.isDragging) return;

      const p = params as { data: { value: number[] } };
      const barIndex = p.data?.value?.[3];
      if (barIndex === undefined) return;

      const bar = options.timelineBars.value[barIndex];
      if (!bar) return;

      if (bar.type === 'gap' && bar.gapInfo) {
        // Hovering a gap
        const gapKey = `${bar.gapInfo.afterPeriodIndex}-${bar.gapInfo.beforePeriodIndex}`;
        if (hoveredGapKey.value !== gapKey) {
          hoveredGapKey.value = gapKey;
        }
      } else {
        // Hovering a regular period bar
        const periodIndex = p.data?.value?.[4];
        if (periodIndex !== undefined && periodIndex !== hoveredPeriodIndex.value) {
          hoveredPeriodIndex.value = periodIndex;
        }
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 2 }, () => {
      // Don't clear hover state during drag - keep the dragged period highlighted
      if (dragState.value?.isDragging) return;

      if (hoveredPeriodIndex.value !== -1) {
        hoveredPeriodIndex.value = -1;
      }
      if (hoveredGapKey.value !== null) {
        hoveredGapKey.value = null;
      }
    });

    // Set up click handler for period selection (only if not dragging)
    chartInstance.value.on('click', { seriesIndex: 2 }, (params: unknown) => {
      // Skip click if drag just occurred
      if (dragOccurred) {
        dragOccurred = false;
        return;
      }

      const p = params as { data: { value: number[] } };
      const barIndex = p.data?.value?.[3];
      if (barIndex === undefined) return;

      const bar = options.timelineBars.value[barIndex];
      if (!bar) return;

      if (bar.type === 'gap' && bar.gapInfo && options.onGapClick) {
        options.onGapClick(bar.gapInfo);
      } else if (bar.type !== 'gap') {
        const periodIndex = p.data?.value?.[4];
        if (periodIndex !== undefined && options.onPeriodClick) {
          options.onPeriodClick(periodIndex);
        }
      }
    });
  }

  // Cleanup event listeners
  onUnmounted(() => {
    document.removeEventListener('mouseup', globalMouseUp);
    if (chartContainer.value) {
      chartContainer.value.removeEventListener('mousemove', onContainerMouseMove);
      chartContainer.value.removeEventListener('mousedown', onContainerMouseDown);
      chartContainer.value.removeEventListener('mouseup', onContainerMouseUp);
    }
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
      refresh();
      // Recalculate resize zones after refresh
      if (chartInstance.value) {
        resizeZones.value = calculateResizeZones(chartInstance.value.getWidth());
      }
    },
    { deep: true },
  );

  // Watch for hover state changes to update bar highlighting
  watch([hoveredPeriodIndex, hoveredGapKey], () => {
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
