export const CYCLE_RULES = {
  /** Minimum fasting duration in hours */
  MIN_DURATION_HOURS: 1,
  /** Minimum fasting duration in milliseconds (1 hour) */
  MIN_DURATION_MS: 60 * 60 * 1000,
} as const;

export const CYCLE_VALIDATION_MESSAGES = {
  DURATION_TOO_SHORT: {
    summary: 'Fasting duration too short',
    detail: 'Fasting duration must be at least 1 hour.',
  },
  START_DATE_IN_FUTURE: {
    summary: 'Start date in future',
    detail: 'Start date must be in the past.',
  },
  OVERLAPPING_CYCLES: {
    summary: 'Overlapping cycles',
    detail: 'This start time overlaps a previous cycle. Choose a start time after the last cycle finishes.',
  },
  INVALID_DURATION: {
    summary: 'Invalid fasting duration',
    detail: 'End date must be after the start date.',
  },
} as const;
