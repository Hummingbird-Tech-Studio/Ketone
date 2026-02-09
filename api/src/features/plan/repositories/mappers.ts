import { Effect, Schema as S } from 'effect';
import { Plan, Period, PlanWithPeriods } from '../domain';
import { PlanRepositoryError } from './errors';
import type { PlanRecord, PeriodRecord } from './schemas';

/**
 * Boundary mappers: DB DTO (PlanRecord/PeriodRecord) → Domain Entity (Plan/Period).
 *
 * The repository schemas handle format transforms (NumericFromString, DateFromSelf).
 * These mappers apply branded type validation and phase ordering invariants,
 * producing fully validated domain entities.
 */

/**
 * Decode a PlanRecord (DB DTO) into a Plan domain entity.
 * Applies branded type validation (PlanName, PlanDescription, PlanId).
 */
export const decodePlan = (record: PlanRecord): Effect.Effect<Plan, PlanRepositoryError> =>
  S.decodeUnknown(Plan)(record).pipe(
    Effect.mapError(
      (error) =>
        new PlanRepositoryError({
          message: 'Failed to decode PlanRecord into Plan domain entity',
          cause: error,
        }),
    ),
  );

/**
 * Decode a PeriodRecord (DB DTO) into a Period domain entity.
 * Applies branded type validation (FastingDuration, EatingWindow, PeriodOrder)
 * and phase ordering invariants.
 */
export const decodePeriod = (record: PeriodRecord): Effect.Effect<Period, PlanRepositoryError> =>
  S.decodeUnknown(Period)(record).pipe(
    Effect.mapError(
      (error) =>
        new PlanRepositoryError({
          message: 'Failed to decode PeriodRecord into Period domain entity',
          cause: error,
        }),
    ),
  );

/**
 * Decode plan + period records into a PlanWithPeriods aggregate.
 * Accepts either PlanRecord (DB DTO) or Plan (domain entity) for the plan,
 * and either PeriodRecord[] or Period[] for periods, since S.decodeUnknown
 * validates structurally.
 */
export const decodePlanWithPeriods = (
  planRecord: PlanRecord | Plan,
  periodRecords: ReadonlyArray<PeriodRecord | Period>,
): Effect.Effect<PlanWithPeriods, PlanRepositoryError> =>
  S.decodeUnknown(PlanWithPeriods)({
    ...planRecord,
    periods: periodRecords,
  }).pipe(
    Effect.mapError(
      (error) =>
        new PlanRepositoryError({
          message: 'Failed to decode PlanWithPeriods domain entity',
          cause: error,
        }),
    ),
  );
