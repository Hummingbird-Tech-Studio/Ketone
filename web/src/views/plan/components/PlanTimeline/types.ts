export type BarType = 'fasting' | 'eating' | 'gap';

export interface GapInfo {
  /** Index of the non-deleted period that ends before this gap */
  afterPeriodIndex: number;
  /** Index of the non-deleted period that starts after this gap */
  beforePeriodIndex: number;
}

export interface TimelineBar {
  periodIndex: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string;
  type: BarType;
  /** Present only for gap bars */
  gapInfo?: GapInfo;
}

/**
 * Configuration for a single period in the timeline.
 * Each period has its own fasting duration, eating window, and fixed start time.
 */
export interface PeriodConfig {
  startTime: Date;
  fastingDuration: number;
  eatingWindow: number;
  deleted: boolean;
}

// Drag-to-resize types
export type DragEdge = 'left' | 'right';
export type DragBarType = 'fasting' | 'eating';

/** Represents an update to a single period during drag operations */
export interface PeriodUpdate {
  periodIndex: number;
  changes: Partial<PeriodConfig>;
}

export interface DragState {
  isDragging: boolean;
  edge: DragEdge;
  barType: DragBarType;
  periodIndex: number;
  startX: number;
  hourDelta: number;
  // Original values at drag start (to avoid cumulative errors)
  originalStartTime: Date;
  originalFastingDuration: number;
  originalEatingWindow: number;
  // Original values of previous period (for propagation without cumulative errors)
  prevPeriodIndex: number;
  originalPrevFastingDuration: number;
  originalPrevEatingWindow: number;
  // Original values of next period (for propagation without cumulative errors)
  nextPeriodIndex: number;
  originalNextStartTime: Date | null;
  originalNextFastingDuration: number;
}

export interface ResizeZone {
  x: number;
  y: number;
  width: number;
  height: number;
  edge: DragEdge;
  barType: DragBarType;
  periodIndex: number;
  bar: TimelineBar;
}
