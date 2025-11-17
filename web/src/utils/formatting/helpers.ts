import { format } from 'date-fns';

const formatNumber = (num: number): string =>
  num.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });

export const formatTime = (hours: number, minutes: number, seconds: number): string => {
  return `${formatNumber(hours)}:${formatNumber(minutes)}:${formatNumber(seconds)}`;
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

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Formats a date to time only with lowercase meridiem (e.g., "3:45 p.m.")
 */
export const formatTimeWithMeridiem = (date: Date): string => {
  return format(date, 'h:mm a')
    .replace(' AM', ' a.m.')
    .replace(' PM', ' p.m.');
};

/**
 * Formats a date to full date and time with lowercase meridiem (e.g., "November 17, 2025 3:45 p.m.")
 */
export const formatFullDateTime = (date: Date): string => {
  return format(date, 'MMMM d, yyyy h:mm a')
    .replace(' AM', ' a.m.')
    .replace(' PM', ' p.m.');
};

/**
 * Formats a date to full date and time with "at" separator and lowercase meridiem
 * (e.g., "November 17, 2025, at 3:45 p.m.")
 */
export const formatFullDateTimeWithAt = (date: Date): string => {
  return format(date, "MMMM d, yyyy, 'at' h:mm a")
    .replace(' AM', ' a.m.')
    .replace(' PM', ' p.m.');
};
