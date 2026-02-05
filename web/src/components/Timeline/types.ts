import type { AdjacentCycle, PeriodResponse } from '@ketone/shared';
import type { AnyActorRef } from 'xstate';

// ============================================================================
// Core Types
// ============================================================================

export type BarType = 'fasting' | 'eating';
export type PeriodState = 'scheduled' | 'in_progress' | 'completed';
export type TimelineMode = 'view' | 'edit';

/**
 * Represents a single bar segment in the timeline chart.
 * Bars can span across days, so a single period may produce multiple bars.
 */
export interface TimelineBar {
  periodIndex: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string; // Formatted duration string (e.g., "16h", "8h 30m")
  type: BarType;
  periodState: PeriodState;
}

/**
 * Bar representing a completed cycle in the timeline (edit mode only).
 * Similar to TimelineBar but without periodIndex (not part of the plan).
 */
export interface CompletedCycleBar {
  dayIndex: number;
  startHour: number;
  endHour: number;
  segmentDuration: string; // Duration of this segment (e.g., "8h")
  totalDuration: string; // Total cycle duration (e.g., "16h")
  startDate: Date;
  endDate: Date;
  isWeakSpanning: boolean; // Whether this cycle spans multiple days
}

/**
 * Configuration for a single period in the timeline (edit mode).
 * Each period has its own fasting duration, eating window, and fixed start time.
 * For new periods, use crypto.randomUUID() to generate a temporary id.
 */
export interface PeriodConfig {
  id: string;
  startTime: Date;
  fastingDuration: number;
  eatingWindow: number;
}

// ============================================================================
// Drag Types (Edit Mode Only)
// ============================================================================

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

// ============================================================================
// Current Time Position
// ============================================================================

export interface CurrentTimePosition {
  dayIndex: number;
  hourPosition: number;
  // View mode specific fields
  isInFasting?: boolean;
  isWaiting?: boolean;
}

// ============================================================================
// Chart Dimensions (Edit Mode)
// ============================================================================

export interface ChartDimensions {
  width: number;
  dayLabelWidth: number;
  gridWidth: number;
}

// ============================================================================
// Timeline Props
// ============================================================================

export interface TimelineProps {
  /** Mode: 'view' for read-only, 'edit' for drag-to-resize functionality */
  mode: TimelineMode;

  /** Periods data - use periods for view mode, periodConfigs for edit mode */
  periods?: readonly PeriodResponse[];
  periodConfigs?: PeriodConfig[];

  /** Tracking the current period (view mode only) */
  currentPeriodId?: string | null;

  /** Time source for current time marker */
  timeSource?: 'tick' | 'interval';
  /** Actor ref that emits TICK events (required if timeSource='tick') */
  tickActorRef?: AnyActorRef;
  /** Emit event name for TICK (default: 'TICK') */
  tickEventName?: string;

  /** Completed cycle to show (edit mode only) */
  completedCycle?: AdjacentCycle | null;
  /** Min start date for first period - prevents overlap with last cycle (edit mode only) */
  minPlanStartDate?: Date | null;

  /** Whether to show the action button (edit/reset) */
  showActionButton?: boolean;
  /** Action button icon type */
  actionButtonIcon?: 'edit' | 'reset';
  /** Whether the action button is disabled */
  actionButtonDisabled?: boolean;

  /** Whether the timeline is in a loading state (edit mode only) */
  loading?: boolean;
  /** Whether there are unsaved changes (edit mode - affects reset button) */
  hasChanges?: boolean;
}

// ============================================================================
// Timeline Emits
// ============================================================================

export interface TimelineEmits {
  /** Emitted when action button is clicked */
  (e: 'action'): void;
  /** Emitted when period configs are updated via drag (edit mode) */
  (e: 'update:periodConfigs', value: PeriodConfig[]): void;
  /** Emitted when period progress changes (edit mode) */
  (e: 'periodProgress', payload: { completedCount: number; currentIndex: number; total: number }): void;
}
