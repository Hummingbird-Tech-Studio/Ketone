import {
  type CustomRenderItem,
  type ECOption,
  type RenderItemAPI,
  type RenderItemParams,
  type RenderItemReturn,
} from '@/views/statistics/StatisticsChart/composables/chart/types';
import type { PeriodResponse } from '@ketone/shared';
import { computed, watch, type Ref } from 'vue';
import {
  BAR_HEIGHT,
  BAR_PADDING_TOP,
  COLOR_BAR_TEXT,
  COLOR_BORDER,
  COLOR_EATING,
  COLOR_EATING_HIGHLIGHT,
  COLOR_FASTING_ACTIVE,
  COLOR_FASTING_ACTIVE_HIGHLIGHT,
  COLOR_FASTING_COMPLETED,
  COLOR_FASTING_COMPLETED_HIGHLIGHT,
  COLOR_FASTING_PLANNED,
  COLOR_FASTING_PLANNED_HIGHLIGHT,
  COLOR_TEXT,
  getDayLabelWidth,
  HEADER_HEIGHT,
  MOBILE_BREAKPOINT,
  ROW_HEIGHT,
  UNHOVERED_OPACITY,
} from '../constants';
import type { CurrentTimePosition, TimelineBar } from '../types';
import { buildBaseSeries, buildMarkerData, calculateBarGeometry, renderLocationMarker, useChartBase } from './core';
import { formatDuration } from './useTimelineData';

// ============================================================================
// Types
// ============================================================================

export interface UseTimelineChartViewOptions {
  // Data
  numRows: Ref<number>;
  dayLabels: Ref<string[]>;
  hourLabels: Ref<string[]>;
  hourPositions: Ref<number[]>;
  timelineBars: Ref<TimelineBar[]>;
  currentTimePosition: Ref<CurrentTimePosition | null>;

  // View mode specific
  periods: Ref<readonly PeriodResponse[]>;

  // State
  hoveredPeriodIndex: Ref<number>;

  // Event handlers
  onHoverPeriod: (periodIndex: number) => void;
  onHoverExit: () => void;
}

// ============================================================================
// Main Composable
// ============================================================================

export function useTimelineChartView(chartContainer: Ref<HTMLElement | null>, options: UseTimelineChartViewOptions) {
  // Track currently hovered bar index for tooltip re-showing after updates
  let currentHoveredBarIndex: number | null = null;

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

  // Marker data - include current time position values to trigger re-render
  const markerData = computed(() => buildMarkerData(options.currentTimePosition));

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
   * Render function for visible timeline bars (view mode).
   * No drag handles, simpler logic.
   */
  function renderTimelineBarView(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0);
    const startHour = api.value(1);
    const endHour = api.value(2);
    const barIndex = api.value(3);
    const periodIndex = api.value(4);

    const barData = options.timelineBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const { type, duration, periodState } = barData;
    const chartWidth = params.coordSys.width;

    // Use shared geometry calculation
    const geometry = calculateBarGeometry({
      dayIndex,
      startHour,
      endHour,
      periodIndex,
      barData,
      allBars: options.timelineBars.value,
      chartWidth,
    });

    // Get highlighted period from hover
    const highlightedPeriod = options.hoveredPeriodIndex.value;
    const isHighlighted = highlightedPeriod === periodIndex;
    const hasHighlight = highlightedPeriod !== -1;

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

    const children: RenderItemReturn[] = [
      {
        type: 'rect',
        shape: {
          x: 0,
          y: 0,
          width: geometry.finalWidth,
          height: BAR_HEIGHT,
          r: geometry.borderRadius,
        },
        style: {
          fill: barColor,
          opacity: barOpacity,
        },
      },
    ];

    // Duration label (only show if bar is wide enough)
    if (geometry.finalWidth > 25) {
      const period = options.periods.value[periodIndex];
      const phaseDurationHours = period ? (type === 'fasting' ? period.fastingDuration : period.eatingWindow) : 3;

      // Use smaller font for durations < 2h 45m (2.75 hours)
      const isShortDuration = phaseDurationHours < 2.75;
      const fontSize = chartWidth < MOBILE_BREAKPOINT ? (isShortDuration ? 8 : 10) : isShortDuration ? 9 : 11;

      children.push({
        type: 'text',
        style: {
          text: duration,
          x: geometry.finalWidth / 2,
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
      x: geometry.barX,
      y: geometry.barY,
      children,
    };
  }

  /**
   * Render invisible hitbox bars for tooltip triggering (view mode only).
   * These bars handle mouse events while the visible bars handle rendering.
   * This separation allows us to update visible bars without affecting the tooltip.
   */
  function renderTooltipTriggerBar(params: RenderItemParams, api: RenderItemAPI): RenderItemReturn {
    const dayIndex = api.value(0);
    const startHour = api.value(1);
    const endHour = api.value(2);
    const barIndex = api.value(3);

    const barData = options.timelineBars.value[barIndex];
    if (!barData) return { type: 'group', children: [] };

    const chartWidth = params.coordSys.width;
    const dayLabelWidth = getDayLabelWidth(chartWidth);
    const gridWidth = chartWidth - dayLabelWidth;

    // Calculate bar dimensions (same as visible bars but without complex logic)
    const barX = dayLabelWidth + (startHour / 24) * gridWidth;
    const barWidth = ((endHour - startHour) / 24) * gridWidth;
    const barY = HEADER_HEIGHT + dayIndex * ROW_HEIGHT + BAR_PADDING_TOP;
    const finalWidth = Math.max(barWidth, 2);

    return {
      type: 'rect',
      shape: {
        x: barX,
        y: barY,
        width: finalWidth,
        height: BAR_HEIGHT,
      },
      style: {
        fill: 'rgba(0, 0, 0, 0.001)', // Nearly invisible but still captures mouse events
      },
    };
  }

  // ========================================
  // Tooltip Formatting
  // ========================================

  /**
   * Format tooltip content for period info (view mode with PeriodResponse).
   */
  function formatTooltipContentViewMode(barData: TimelineBar): string {
    const period = options.periods.value[barData.periodIndex];
    if (!period) return '';

    const fastingHours = period.fastingDuration;
    const eatingHours = period.eatingWindow;
    const totalHours = fastingHours + eatingHours;
    const periodNumber = barData.periodIndex + 1;

    // Determine phase-specific info based on bar type
    const isFasting = barData.type === 'fasting';
    const phaseLabel = isFasting ? 'Fast' : 'Eating Window';
    const phaseDuration = isFasting ? fastingHours : eatingHours;

    // Calculate start time for the specific phase
    const periodStartDate = period.startDate instanceof Date ? period.startDate : new Date(period.startDate);
    const phaseStartTime = isFasting
      ? periodStartDate
      : new Date(periodStartDate.getTime() + fastingHours * 60 * 60 * 1000);

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
      // Series 2: Visible timeline bars (silent - don't respond to mouse events)
      // This series handles the visual rendering with highlighting
      {
        id: 'timelineBars',
        type: 'custom',
        renderItem: renderTimelineBarView as unknown as CustomRenderItem,
        data: timelineBarsData.value,
        silent: true,
        z: 10,
      },
      // Series 3: Invisible tooltip trigger bars (NOT silent - handles mouse events)
      // This series is never updated on hover, so the tooltip remains attached
      {
        id: 'tooltipTriggers',
        type: 'custom',
        renderItem: renderTooltipTriggerBar as unknown as CustomRenderItem,
        data: timelineBarsData.value,
        z: 11, // Above visible bars to capture events
      },
      // Series 4: Location marker (rendered last to be on top)
      {
        id: 'marker',
        type: 'custom',
        renderItem: renderLocationMarker as unknown as CustomRenderItem,
        data: markerData.value,
        silent: true,
        z: 100, // Ensure marker is always on top
      },
    ];

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

          // View mode - Series 3 is the invisible tooltip trigger bars
          if (p.seriesIndex !== 3) return '';
          const barIndex = p.data?.value?.[3];
          if (barIndex === undefined) return '';
          const bar = options.timelineBars.value[barIndex];
          if (!bar) return '';
          return formatTooltipContentViewMode(bar);
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
  });

  // ========================================
  // Event Handler Setup
  // ========================================

  function setupEventHandlers() {
    if (!chartInstance.value) return;

    // Cleanup existing ECharts handlers to prevent duplicates on re-initialization
    chartInstance.value.off('mouseover');
    chartInstance.value.off('mouseout');

    // Set up hover event handlers for period highlighting
    // Listen to series 3 (invisible tooltip trigger bars) for mouse events
    chartInstance.value.on('mouseover', { seriesIndex: 3 }, (params: unknown) => {
      const p = params as { data: { value: number[] }; dataIndex?: number };
      const periodIndex = p.data?.value?.[4];

      // Track hovered bar index for tooltip re-showing after updates
      if (p.dataIndex !== undefined) {
        currentHoveredBarIndex = p.dataIndex;
      }

      if (periodIndex !== undefined && periodIndex !== options.hoveredPeriodIndex.value) {
        options.onHoverPeriod(periodIndex);
      }
    });

    chartInstance.value.on('mouseout', { seriesIndex: 3 }, () => {
      currentHoveredBarIndex = null;
      options.onHoverExit();
    });
  }

  // Re-initialize with events when chart becomes available
  watch(
    () => chartInstance.value,
    (instance) => {
      if (instance) {
        setupEventHandlers();
      }
    },
  );

  // ========================================
  // Watchers
  // ========================================

  // Watch for data changes (excluding currentTimePosition to avoid constant re-renders)
  watch(
    [options.numRows, options.dayLabels, options.timelineBars],
    () => {
      if (!chartInstance.value) return;
      // Skip data updates while hovering to prevent tooltip from disappearing
      // timelineBars recomputes every second due to currentTime dependency
      if (options.hoveredPeriodIndex.value !== -1) return;
      refresh();
    },
    { deep: true },
  );

  // Watch for marker position changes - only update the marker series data
  watch(
    options.currentTimePosition,
    () => {
      if (!chartInstance.value) return;
      // Skip marker updates while hovering to prevent tooltip from disappearing
      if (options.hoveredPeriodIndex.value !== -1) return;
      // Only update the marker series without touching other series
      chartInstance.value.setOption({
        series: [{ id: 'marker', data: markerData.value }],
      });
    },
    { deep: true },
  );

  // Watch for hover state changes to update bar highlighting
  watch([options.hoveredPeriodIndex], () => {
    if (!chartInstance.value) return;

    // Update the visible bars series for highlighting effect
    chartInstance.value.setOption({
      series: [{ id: 'timelineBars', data: timelineBarsData.value }],
    });

    // Re-show tooltip if we have a hovered bar (setOption hides it)
    if (currentHoveredBarIndex !== null && options.hoveredPeriodIndex.value !== -1) {
      chartInstance.value.dispatchAction({
        type: 'showTip',
        seriesIndex: 3,
        dataIndex: currentHoveredBarIndex,
      });
    }
  });

  return {
    chartInstance,
    chartHeight,
    refresh,
  };
}
