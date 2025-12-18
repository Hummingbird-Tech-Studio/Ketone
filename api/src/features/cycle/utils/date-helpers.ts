import { isDate, parseISO, isValid, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { PeriodType } from '@ketone/shared';

/**
 * Ensures that a value is converted to a Date object or null
 * Handles Date objects, ISO strings, and other date representations
 * Uses date-fns for robust date validation and parsing
 */
export const ensureDate = (date: unknown): Date | null => {
  if (!date) return null;

  // Check if it's already a valid Date object
  if (isDate(date) && isValid(date)) return date;

  // Try to parse string as ISO date
  if (typeof date === 'string') {
    const parsed = parseISO(date);

    return isValid(parsed) ? parsed : null;
  }

  return null;
};

export interface PeriodRange {
  start: Date;
  end: Date;
}

/**
 * Calculates the start and end dates for a given period type and date
 * - weekly: Sunday 00:00:00 to Saturday 23:59:59.999
 * - monthly: First day 00:00:00 to last day 23:59:59.999
 *
 * @param periodType - The type of period ('weekly' or 'monthly')
 * @param date - The reference date (in UTC)
 * @param timezone - Optional IANA timezone (e.g., 'America/New_York'). If provided,
 *                   the date is converted to the user's timezone before calculating period boundaries.
 */
const calculateRawPeriodRange = (periodType: PeriodType, date: Date): PeriodRange =>
  periodType === 'weekly'
    ? { start: startOfWeek(date, { weekStartsOn: 0 }), end: endOfWeek(date, { weekStartsOn: 0 }) }
    : { start: startOfMonth(date), end: endOfMonth(date) };

export const calculatePeriodRange = (periodType: PeriodType, date: Date, timezone?: string): PeriodRange => {
  if (!timezone) {
    return calculateRawPeriodRange(periodType, date);
  }

  // Convert UTC to user's timezone, calculate boundaries, then convert back to UTC
  const zonedDate = toZonedTime(date, timezone);
  const { start, end } = calculateRawPeriodRange(periodType, zonedDate);

  return {
    start: fromZonedTime(start, timezone),
    end: fromZonedTime(end, timezone),
  };
};
