import { isDate, parseISO, isValid } from 'date-fns';

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
