export interface GanttBar {
  cycleId: string;
  startPos: number;
  endPos: number;
  duration: string;
  status: 'InProgress' | 'Completed';
  isExtended: boolean;
  hasOverflowBefore: boolean;
  hasOverflowAfter: boolean;
  // Tooltip data
  totalDuration: string;
  startDate: Date;
  endDate: Date;
}

export type WeeklyChartViewMode = 'condensed' | 'expanded';

export interface ExpandedGanttBar {
  cycleId: string;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string;
  status: 'InProgress' | 'Completed';
  isExtended: boolean;
  hasOverflowBefore: boolean;
  hasOverflowAfter: boolean;
  // Connection indicators for multi-day fasts
  isConnectedToPrevious: boolean;
  isConnectedToNext: boolean;
  // Tooltip data
  totalDuration: string;
  startDate: Date;
  endDate: Date;
}
