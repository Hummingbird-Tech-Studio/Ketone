import { Schema as S } from 'effect';
import { PeriodTypeSchema, NotesSchema, TimezoneSchema } from '@ketone/shared';
import { CYCLE_VALIDATION_MESSAGES } from '../../domain';

// Tolerance in milliseconds to account for clock drift between client devices and server.
// Mobile devices often have slightly ahead clocks, causing "start date in future" validation failures.
const CLOCK_DRIFT_TOLERANCE_MS = 5_000; // 5 seconds

const validateCycleDates = (data: { startDate: Date; endDate: Date }): Array<S.FilterIssue> => {
  const issues: Array<S.FilterIssue> = [];
  const now = new Date();
  const nowWithTolerance = new Date(now.getTime() + CLOCK_DRIFT_TOLERANCE_MS);

  if (data.endDate <= data.startDate) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.INVALID_DURATION.detail,
    });
  }

  if (data.startDate > nowWithTolerance) {
    issues.push({
      path: ['startDate'],
      message: CYCLE_VALIDATION_MESSAGES.START_DATE_IN_FUTURE.detail,
    });
  }

  return issues;
};

export const CreateCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
  notes: S.optional(NotesSchema),
}).pipe(S.filter(validateCycleDates));

export const UpdateCycleDatesSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
  notes: S.optional(NotesSchema),
}).pipe(S.filter(validateCycleDates));

export const CompleteCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
  notes: S.optional(NotesSchema),
}).pipe(S.filter(validateCycleDates));

export const GetCycleStatisticsQuerySchema = S.Struct({
  period: PeriodTypeSchema,
  date: S.DateFromString,
  tz: S.optional(TimezoneSchema),
});

// Schema for updating only notes (used by PATCH /v1/cycles/:id/notes)
export const UpdateCycleNotesSchema = S.Struct({
  notes: NotesSchema,
});
