import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { Effect } from 'effect';
import type { PeriodType } from '@ketone/shared';
import { TimezoneConversionError } from '../domain';

export interface PeriodRange {
  start: Date;
  end: Date;
}

const calculateRawPeriodRange = (periodType: PeriodType, date: Date): PeriodRange =>
  periodType === 'weekly'
    ? { start: startOfWeek(date, { weekStartsOn: 0 }), end: endOfWeek(date, { weekStartsOn: 0 }) }
    : { start: startOfMonth(date), end: endOfMonth(date) };

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
export const calculatePeriodRange = (
  periodType: PeriodType,
  date: Date,
  timezone?: string,
): Effect.Effect<PeriodRange, TimezoneConversionError> => {
  if (!timezone) {
    return Effect.succeed(calculateRawPeriodRange(periodType, date));
  }

  return Effect.try({
    try: () => {
      // Convert UTC to user's timezone, calculate boundaries, then convert back to UTC
      const zonedDate = toZonedTime(date, timezone);
      const { start, end } = calculateRawPeriodRange(periodType, zonedDate);
      return {
        start: fromZonedTime(start, timezone),
        end: fromZonedTime(end, timezone),
      };
    },
    catch: (error) =>
      new TimezoneConversionError({
        message: `Invalid timezone: ${timezone}`,
        timezone,
        cause: error,
      }),
  });
};
