export const CYCLE_VALIDATION_MESSAGES = {
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
