import { format } from 'date-fns';

const formatNumber = (num: number): string =>
  num.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;

export const formatTime = (hours: number, minutes: number, seconds: number): string => {
  return `${formatNumber(hours)}:${formatNumber(minutes)}:${formatNumber(seconds)}`;
};

/**
 * Calculates and formats the fasting time between two dates
 * @param startDate - The start date of the fasting period
 * @param endDate - The end date of the fasting period
 * @returns Formatted time string in HH:MM:SS format
 */
export const calculateFastingTime = (startDate: Date, endDate: Date): string => {
  const elapsedSeconds = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 1000));

  const hours = Math.floor(elapsedSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((elapsedSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE);
  const seconds = elapsedSeconds % SECONDS_PER_MINUTE;

  return formatTime(hours, minutes, seconds);
};

export const formatHour = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes.toString();

  return `${formattedHours}:${formattedMinutes} ${meridiem}`;
};

export const formatDate = (date: Date): string => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayOfWeek = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayOfMonth = date.getDate();

  return `${dayOfWeek}, ${month} ${dayOfMonth}`;
};

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Formats a date to time only with lowercase meridiem (e.g., "3:45 p.m.")
 */
export const formatTimeWithMeridiem = (date: Date): string => {
  return format(date, 'h:mm a').replace(' AM', ' a.m.').replace(' PM', ' p.m.');
};

/**
 * Formats a date to full date and time with lowercase meridiem (e.g., "November 17, 2025 3:45 p.m.")
 */
export const formatFullDateTime = (date: Date): string => {
  return format(date, 'MMMM d, yyyy h:mm a').replace(' AM', ' a.m.').replace(' PM', ' p.m.');
};

/**
 * Formats a date to full date and time with "at" separator and lowercase meridiem
 * (e.g., "November 17, 2025, at 3:45 p.m.")
 */
export const formatFullDateTimeWithAt = (date: Date): string => {
  return format(date, "MMMM d, yyyy, 'at' h:mm a").replace(' AM', ' a.m.').replace(' PM', ' p.m.');
};

/**
 * Formats a date to short date and time (e.g., "Jul 22, 6:00 PM")
 */
export const formatShortDateTime = (date: Date): string => {
  return format(date, 'MMM d, h:mm a');
};
