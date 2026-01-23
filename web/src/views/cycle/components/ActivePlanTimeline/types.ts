export type BarType = 'fasting' | 'eating';

export type PeriodState = 'scheduled' | 'in_progress' | 'completed';

export interface ActivePlanTimelineBar {
  periodIndex: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string;
  type: BarType;
  periodState: PeriodState;
}
