import type { PeriodStatus } from '@ketone/shared';

export type BarType = 'fasting' | 'eating';

export interface ActivePlanTimelineBar {
  periodIndex: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  duration: string;
  type: BarType;
  periodStatus: PeriodStatus;
}

export interface ActivePlanTimelineProps {
  activePlanActorRef: unknown;
}
