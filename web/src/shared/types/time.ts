/**
 * Meridian type for 12-hour time format
 */
export type Meridian = 'AM' | 'PM';

/**
 * Meridian constants
 */
export const MERIDIAN = {
  AM: 'AM',
  PM: 'PM',
} as const;

/**
 * Represents time in 12-hour format with AM/PM period
 */
export interface TimeValue {
  hours: number;
  minutes: number;
  period: Meridian;
}
