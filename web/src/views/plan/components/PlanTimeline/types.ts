export type BarType = 'fasting' | 'eating';

export interface TimelineBar {
  periodIndex: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string;
  type: BarType;
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
export type DragBarType = BarType;

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
  // Original values of previous period (null if no previous period)
  prevPeriodIndex: number | null;
  originalPrevFastingDuration: number | null;
  originalPrevEatingWindow: number | null;
  // Original values of next period (null if no next period)
  nextPeriodIndex: number | null;
  originalNextStartTime: Date | null;
  originalNextFastingDuration: number | null;
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
