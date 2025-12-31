import { formatDuration } from '@/utils';
import type { CycleStatisticsItem } from '@ketone/shared';
import { computed, type Ref } from 'vue';
import { MS_PER_MINUTE } from './chart/constants';
import type { MonthlyGanttBar } from './useMonthlyGanttChart';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface UseMonthlyChartDataProps {
  cycles: Ref<readonly CycleStatisticsItem[]>;
  periodStart: Ref<Date | undefined>;
  periodEnd: Ref<Date | undefined>;
}

interface WeekInfo {
  weekIndex: number;
  startDate: Date;
  endDate: Date;
}

export function useMonthlyChartData(props: UseMonthlyChartDataProps) {
  const chartTitle = computed(() => 'Month Statistics');

  const dateRange = computed(() => {
    if (!props.periodStart.value) return '';
    return props.periodStart.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  const dayLabels = computed(() => DAY_LABELS);

  // Calculate the calendar weeks for the month
  const weeksInfo = computed((): WeekInfo[] => {
    if (!props.periodStart.value || !props.periodEnd.value) return [];

    const monthStart = props.periodStart.value;
    const monthEnd = props.periodEnd.value;

    // Get the first day of the month and find the Sunday of that week
    const firstDayOfMonth = new Date(monthStart);
    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

    // Start from the Sunday of the week containing the first day
    const calendarStart = new Date(firstDayOfMonth);
    calendarStart.setDate(calendarStart.getDate() - firstDayOfWeek);
    calendarStart.setHours(0, 0, 0, 0);

    const weeks: WeekInfo[] = [];
    const currentWeekStart = new Date(calendarStart);
    let weekIndex = 0;

    // Keep adding weeks until we've passed the end of the month
    while (currentWeekStart <= monthEnd) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      weeks.push({
        weekIndex,
        startDate: new Date(currentWeekStart),
        endDate: weekEnd,
      });

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekIndex++;
    }

    return weeks;
  });

  const numWeeks = computed(() => weeksInfo.value.length);

  // Build the weekDates array - date numbers for each cell
  const weekDates = computed((): (number | null)[][] => {
    if (!props.periodStart.value || !props.periodEnd.value) return [];

    const monthStart = props.periodStart.value;
    const monthEnd = props.periodEnd.value;

    return weeksInfo.value.map((week) => {
      const dates: (number | null)[] = [];

      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(week.startDate);
        cellDate.setDate(cellDate.getDate() + i);

        // Only show date if it's within the month
        if (cellDate >= monthStart && cellDate <= monthEnd) {
          dates.push(cellDate.getDate());
        } else {
          dates.push(null);
        }
      }

      return dates;
    });
  });

  // Calculate gantt bars, splitting cycles that span multiple weeks
  const ganttBars = computed((): MonthlyGanttBar[] => {
    if (!props.periodStart.value || !props.periodEnd.value || weeksInfo.value.length === 0) return [];

    const bars: MonthlyGanttBar[] = [];

    props.cycles.value.forEach((cycle) => {
      const cycleStart = cycle.startDate.getTime();
      const cycleEnd = cycle.effectiveEndDate.getTime();

      if (cycleStart >= cycleEnd) return;

      // Calculate total duration of the cycle (not clamped to any period)
      const totalMinutes = Math.floor((cycleEnd - cycleStart) / MS_PER_MINUTE);

      // Find which weeks this cycle overlaps with
      weeksInfo.value.forEach((week) => {
        const weekStartTime = week.startDate.getTime();
        const weekEndTime = week.endDate.getTime();

        // Check if cycle overlaps with this week
        if (cycleEnd <= weekStartTime || cycleStart > weekEndTime) {
          return; // No overlap
        }

        // Clamp cycle to week bounds
        const barStartTime = Math.max(cycleStart, weekStartTime);
        const barEndTime = Math.min(cycleEnd, weekEndTime);

        // Calculate position within the week (0-7)
        const weekDuration = weekEndTime - weekStartTime;
        const startPos = ((barStartTime - weekStartTime) / weekDuration) * 7;
        const endPos = ((barEndTime - weekStartTime) / weekDuration) * 7;

        // Determine overflow flags
        const hasOverflowBefore = cycleStart < weekStartTime;
        const hasOverflowAfter = cycleEnd > weekEndTime;

        // Calculate duration for this segment
        const segmentDuration = barEndTime - barStartTime;
        const segmentMinutes = Math.floor(segmentDuration / MS_PER_MINUTE);

        bars.push({
          cycleId: cycle.id,
          weekIndex: week.weekIndex,
          startPos,
          endPos,
          duration: formatDuration(segmentMinutes),
          status: cycle.status,
          isExtended: cycle.isExtended,
          hasOverflowBefore,
          hasOverflowAfter,
          totalDuration: formatDuration(totalMinutes),
          startDate: cycle.startDate,
          endDate: cycle.effectiveEndDate,
        });
      });
    });

    // Sort bars by week index, then by start position
    bars.sort((a, b) => {
      if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;
      return a.startPos - b.startPos;
    });

    return bars;
  });

  return {
    chartTitle,
    dateRange,
    numWeeks,
    dayLabels,
    weekDates,
    ganttBars,
  };
}
