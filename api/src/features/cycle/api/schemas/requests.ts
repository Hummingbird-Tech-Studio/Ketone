import { Schema as S } from 'effect';
import { DurationValidation } from '@ketone/shared';
import { CYCLE_RULES, CYCLE_VALIDATION_MESSAGES } from '../../domain';

const validateCycleDatesBase = (
  data: { startDate: Date; endDate: Date },
  validation: DurationValidation,
): Array<S.FilterIssue> => {
  const issues: Array<S.FilterIssue> = [];
  const now = new Date();
  const duration = data.endDate.getTime() - data.startDate.getTime();

  if (data.endDate <= data.startDate) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.INVALID_DURATION.detail,
    });
  }

  if (validation === DurationValidation.EnforceMinDuration && duration < CYCLE_RULES.MIN_DURATION_MS) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.DURATION_TOO_SHORT.detail,
    });
  }

  if (data.startDate > now) {
    issues.push({
      path: ['startDate'],
      message: CYCLE_VALIDATION_MESSAGES.START_DATE_IN_FUTURE.detail,
    });
  }

  return issues;
};

// Validation for creating cycles - enforces minimum duration
const validateCycleDatesWithMinDuration = (data: { startDate: Date; endDate: Date }): Array<S.FilterIssue> => {
  return validateCycleDatesBase(data, DurationValidation.EnforceMinDuration);
};

// Validation for updating/completing cycles - allows any duration
const validateCycleDatesWithoutMinDuration = (data: { startDate: Date; endDate: Date }): Array<S.FilterIssue> => {
  return validateCycleDatesBase(data, DurationValidation.AllowAnyDuration);
};

export const CreateCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDatesWithMinDuration));

export const UpdateCycleDatesSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDatesWithoutMinDuration));

export const CompleteCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDatesWithoutMinDuration));
