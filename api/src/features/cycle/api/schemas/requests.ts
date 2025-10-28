import { Schema as S } from 'effect';
import { CYCLE_RULES, CYCLE_VALIDATION_MESSAGES, CycleStateSchema } from '../../domain';

/**
 * Request Validation Schemas
 *
 * These schemas validate incoming HTTP request payloads.
 * They include business rules and validation logic.
 */

// ============================================================================
// Branded Types
// ============================================================================

const UserIdSchema = S.UUID.pipe(S.brand('UserId'));

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Create Cycle Schema
 * 
 * For Orleans architecture, we only need the cycle data.
 * The machine state will be created and persisted automatically.
 */
export const CreateCycleOrleansSchema = S.Struct({
  startDate: S.Date,
  endDate: S.Date,
}).pipe(
  S.filter((data) => {
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
  }),
);

/**
 * Update Cycle Orleans Schema
 * 
 * For completing a cycle. Requires the cycle ID to prevent race conditions
 * (e.g., multiple browser tabs with different cycle states).
 * The cycle ID must match the currently active cycle.
 */
export const UpdateCycleOrleansSchema = S.Struct({
  cycleId: S.UUID,
  startDate: S.Date,
  endDate: S.Date,
}).pipe(
  S.filter((data) => {
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
  }),
);
