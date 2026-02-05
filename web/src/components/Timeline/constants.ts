// Colors - status-based (period state)
export const COLOR_FASTING_PLANNED = '#99CCFF'; // Blue - planned/scheduled fast
export const COLOR_FASTING_COMPLETED = '#97EBDB'; // Teal - completed fast
export const COLOR_FASTING_ACTIVE = '#DFC9FB'; // Purple - active/in-progress fast
export const COLOR_EATING = '#FFEECC'; // Yellow - eating window

// Highlight colors (slightly darker for hover effect)
export const COLOR_FASTING_PLANNED_HIGHLIGHT = '#7ab8f0';
export const COLOR_FASTING_COMPLETED_HIGHLIGHT = '#7dd4c4';
export const COLOR_FASTING_ACTIVE_HIGHLIGHT = '#c9a8e8';
export const COLOR_EATING_HIGHLIGHT = '#f0ddb3';

// Completed cycle colors (edit mode only)
export const COLOR_COMPLETED_CYCLE = '#96f4a0'; // Green - completed cycle
export const COLOR_COMPLETED_CYCLE_STRIPE = 'rgba(0, 0, 0, 0.15)';

// Location marker color
export const COLOR_LOCATION_MARKER = '#e57373'; // Pink/red for current position

// Other colors
export const COLOR_BAR_TEXT = '#000000';
export const COLOR_BORDER = '#e0e0e0';
export const COLOR_TEXT = '#494949';

// Layout constants
export const HEADER_HEIGHT = 30;
export const DAY_LABEL_WIDTH_DESKTOP = 52;
export const DAY_LABEL_WIDTH_MOBILE = 42;
export const MOBILE_BREAKPOINT = 400;
export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 28;
export const BAR_PADDING_TOP = 6;
export const BAR_PADDING_HORIZONTAL = 1;
export const BAR_BORDER_RADIUS = 4;
export const GRID_BORDER_RADIUS = 8;

// Drag resize constants (edit mode only)
export const MOBILE_RESIZE_HANDLE_WIDTH = 24;
export const CURSOR_RESIZE_EW = 'ew-resize';

// Mobile drag handle visual constants
export const HANDLE_COLOR = 'rgba(255, 255, 255, 0.9)';
export const HANDLE_PILL_WIDTH = 4;
export const HANDLE_PILL_HEIGHT = 16;
export const HANDLE_INSET = 6;

// Touch constants
export const TOUCH_TOOLTIP_OFFSET_Y = 50; // Position above finger to remain visible

// Opacity when period is not hovered
export const UNHOVERED_OPACITY = 0.4;

// Time refresh intervals
export const TICK_INTERVAL_MS = 100; // For view mode with actor TICK
export const INTERVAL_REFRESH_MS = 60000; // For edit mode with setInterval (1 minute)

// Completed cycle visibility (edit mode only)
export const MAX_CYCLE_VISIBILITY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Get day label width based on chart width and mobile breakpoint.
 */
export function getDayLabelWidth(chartWidth: number): number {
  return chartWidth < MOBILE_BREAKPOINT ? DAY_LABEL_WIDTH_MOBILE : DAY_LABEL_WIDTH_DESKTOP;
}
