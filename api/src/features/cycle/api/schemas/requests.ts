import { Schema as S } from 'effect';
import { CYCLE_VALIDATION_MESSAGES } from '../../domain';

const validateCycleDates = (data: { startDate: Date; endDate: Date }): Array<S.FilterIssue> => {
  const issues: Array<S.FilterIssue> = [];
  const now = new Date();

  if (data.endDate <= data.startDate) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.INVALID_DURATION.detail,
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

export const CreateCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));

export const UpdateCycleDatesSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));

export const CompleteCycleSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));
