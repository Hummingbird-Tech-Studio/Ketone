import { Schema as S } from 'effect';
import { CYCLE_RULES, CYCLE_VALIDATION_MESSAGES } from '../../domain';

/**
 * Request Validation Schemas
 */

/**
 * Common date validation logic for cycle dates
 */
const validateCycleDates = (data: { startDate: Date; endDate: Date }): Array<S.FilterIssue> => {
  const issues: Array<S.FilterIssue> = [];
  const now = new Date();
  const duration = data.endDate.getTime() - data.startDate.getTime();

  // Validate: end date must be after start date
  if (data.endDate <= data.startDate) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.INVALID_DURATION.detail,
    });
  }

  // Validate: duration must be at least 1 hour
  if (duration < CYCLE_RULES.MIN_DURATION_MS) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.DURATION_TOO_SHORT.detail,
    });
  }

  // Validate: start date must not be in the future
  if (data.startDate > now) {
    issues.push({
      path: ['startDate'],
      message: CYCLE_VALIDATION_MESSAGES.START_DATE_IN_FUTURE.detail,
    });
  }

  // Validate: end date must not be in the future
  if (data.endDate > now) {
    issues.push({
      path: ['endDate'],
      message: CYCLE_VALIDATION_MESSAGES.END_DATE_IN_FUTURE.detail,
    });
  }

  return issues;
};

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Create Cycle Schema
 */
export const CreateCycleOrleansSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));

/**
 * Update Cycle Orleans Schema
 */
export const UpdateCycleOrleansSchema = S.Struct({
  cycleId: S.UUID,
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));

/**
 * Update Cycle Dates Schema
 */
export const UpdateCycleDatesSchema = S.Struct({
  cycleId: S.UUID,
  startDate: S.Date,
  endDate: S.Date,
}).pipe(S.filter(validateCycleDates));
