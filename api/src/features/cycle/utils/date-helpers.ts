import { isDate, parseISO, isValid, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

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

export type PeriodType = 'weekly' | 'monthly';

export interface PeriodRange {
  start: Date;
  end: Date;
}

/**
 * Calculates the start and end dates for a given period type and date
 * - weekly: Monday 00:00:00 to Sunday 23:59:59.999
 * - monthly: First day 00:00:00 to last day 23:59:59.999
 */
export const calculatePeriodRange = (periodType: PeriodType, date: Date): PeriodRange => {
  if (periodType === 'weekly') {
    return {
      start: startOfWeek(date, { weekStartsOn: 1 }),
      end: endOfWeek(date, { weekStartsOn: 1 }),
    };
  }
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
};
