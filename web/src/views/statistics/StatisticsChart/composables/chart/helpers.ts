import type { ExpandedGanttBar, GanttBar } from '../../types';
import type { RenderItemReturn } from './types';

export interface DaySegment {
  dayIndex: number;
  startHour: number;
  endHour: number;
  durationMinutes: number;
}

export interface ParsedDuration {
  hoursPart: string;
  minutesPart: string;
}

/**
 * Splits a cycle into day segments for the expanded weekly view.
 * Each segment represents the portion of the cycle within a single day.
 */
export function splitCycleByDay(
  cycleStart: Date,
  cycleEnd: Date,
  periodStart: Date,
  periodEnd: Date,
): DaySegment[] {
  const segments: DaySegment[] = [];

  // Clamp to period bounds
  const effectiveStart = new Date(Math.max(cycleStart.getTime(), periodStart.getTime()));
  const effectiveEnd = new Date(Math.min(cycleEnd.getTime(), periodEnd.getTime()));

  if (effectiveStart >= effectiveEnd) return segments;

  // Iterate through each day in the period
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayStart = new Date(periodStart);
    dayStart.setDate(dayStart.getDate() + dayIndex);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dayEnd.setHours(0, 0, 0, 0);

    // Check if cycle overlaps this day
    if (effectiveEnd.getTime() <= dayStart.getTime() || effectiveStart.getTime() >= dayEnd.getTime()) {
      continue;
    }

    // Calculate segment bounds within this day
    const segmentStart = Math.max(effectiveStart.getTime(), dayStart.getTime());
    const segmentEnd = Math.min(effectiveEnd.getTime(), dayEnd.getTime());

    const segmentStartDate = new Date(segmentStart);
    const segmentEndDate = new Date(segmentEnd);

    // Convert to hour positions (0-24)
    const startHour = segmentStartDate.getHours() + segmentStartDate.getMinutes() / 60;

    // If segment ends at midnight of next day, use 24
    let endHour: number;
    if (segmentEnd === dayEnd.getTime()) {
      endHour = 24;
    } else {
      endHour = segmentEndDate.getHours() + segmentEndDate.getMinutes() / 60;
    }

    const durationMinutes = Math.floor((segmentEnd - segmentStart) / (1000 * 60));

    segments.push({
      dayIndex,
      startHour,
      endHour,
      durationMinutes,
    });
  }

  return segments;
}

/**
 * Parses a duration string (e.g., "16h 30m", "16h", "30m") into hours and minutes parts.
 */
export function parseDuration(duration: string): ParsedDuration {
  const parts = duration.split(' ');
  return {
    hoursPart: parts.find((p) => p.includes('h')) || '',
    minutesPart: parts.find((p) => p.includes('m')) || '',
  };
}

/**
 * Formats a date for tooltip display (e.g., "Mon, Jul 22, 4:30PM")
 */
function formatTooltipDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNum = date.getDate();

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes.toString();

  return `${dayName}, ${month} ${dayNum}, ${formattedHours}:${formattedMinutes}${meridiem}`;
}

/**
 * Creates a stripe pattern overlay for indicating overflow in Gantt bars.
 * Used when a cycle spans across multiple weeks/periods.
 */
export function createStripeOverlay(
  width: number,
  height: number,
  status: 'InProgress' | 'Completed',
  hasOverflowBefore: boolean,
  hasOverflowAfter: boolean,
  borderRadius: number,
): RenderItemReturn | null {
  if (!hasOverflowBefore && !hasOverflowAfter) return null;

  // For active (purple) cycles, use white semi-transparent stripes
  // For completed (green) cycles, use dark semi-transparent stripes
  const stripeColor = status === 'InProgress' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)';

  const lines: RenderItemReturn[] = [];
  const spacing = 8;

  // Generate diagonal lines across the entire bar
  for (let i = -height; i < width + height; i += spacing) {
    lines.push({
      type: 'line',
      shape: {
        x1: i,
        y1: height,
        x2: i + height,
        y2: 0,
      },
      style: {
        stroke: stripeColor,
        lineWidth: 2,
      },
    });
  }

  return {
    type: 'group',
    children: lines,
    clipPath: {
      type: 'rect',
      shape: { x: 0, y: 0, width, height, r: borderRadius },
    },
  } as RenderItemReturn;
}

/**
 * Formats tooltip content for a Gantt bar showing cycle information.
 */
export function formatTooltipContent(bar: GanttBar | ExpandedGanttBar): string {
  const startFormatted = formatTooltipDate(bar.startDate);
  const endFormatted = formatTooltipDate(bar.endDate);
  const goalLabel = bar.status === 'InProgress' ? 'Goal' : 'End';
  const isWeekSpanning = bar.hasOverflowBefore || bar.hasOverflowAfter;

  let html = `<div style="line-height: 1.6"><div><span style="font-weight: 600">Total Fast Duration:</span> ${bar.totalDuration}</div><div><span style="font-weight: 600">Start:</span> ${startFormatted}</div><div><span style="font-weight: 600">${goalLabel}:</span> ${endFormatted}</div>`;

  if (isWeekSpanning) {
    html += `<br><div><span style="font-weight: 600">Fasting Period:</span> ${bar.duration}</div>`;
  }

  html += '</div>';
  return html;
}
