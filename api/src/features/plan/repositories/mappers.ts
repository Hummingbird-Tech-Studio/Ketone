import { Effect, Schema as S } from 'effect';
import { Plan, Period, PlanWithPeriods, PlanTemplate, TemplatePeriodConfig, PlanTemplateWithPeriods } from '../domain';
import { PlanRepositoryError, PlanTemplateRepositoryError } from './errors';
import type { PlanRecord, PeriodRecord, PlanTemplateRecord, TemplatePeriodRecord } from './schemas';

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

// ─── Plan Template Boundary Mappers ──────────────────────────────────────────

/**
 * Decode a PlanTemplateRecord (DB DTO) into a PlanTemplate domain entity.
 * Applies branded type validation (PlanTemplateId, PlanName, PlanDescription, PeriodCount).
 */
export const decodePlanTemplate = (
  record: PlanTemplateRecord,
): Effect.Effect<PlanTemplate, PlanTemplateRepositoryError> =>
  S.decodeUnknown(PlanTemplate)(record).pipe(
    Effect.mapError(
      (error) =>
        new PlanTemplateRepositoryError({
          message: 'Failed to decode PlanTemplateRecord into PlanTemplate domain entity',
          cause: error,
        }),
    ),
  );

/**
 * Decode a TemplatePeriodRecord (DB DTO) into a TemplatePeriodConfig value object.
 * Strips DB identity fields (id, planTemplateId, timestamps), keeping only
 * the domain-relevant fields: order, fastingDuration, eatingWindow.
 */
export const decodeTemplatePeriodConfig = (
  record: TemplatePeriodRecord,
): Effect.Effect<TemplatePeriodConfig, PlanTemplateRepositoryError> =>
  S.decodeUnknown(TemplatePeriodConfig)({
    order: record.order,
    fastingDuration: record.fastingDuration,
    eatingWindow: record.eatingWindow,
  }).pipe(
    Effect.mapError(
      (error) =>
        new PlanTemplateRepositoryError({
          message: 'Failed to decode TemplatePeriodRecord into TemplatePeriodConfig',
          cause: error,
        }),
    ),
  );

/**
 * Decode a PlanTemplateRecord + TemplatePeriodRecord[] into a PlanTemplateWithPeriods aggregate.
 * Accepts either PlanTemplateRecord (DB DTO) or PlanTemplate (domain entity).
 */
export const decodePlanTemplateWithPeriods = (
  templateRecord: PlanTemplateRecord | PlanTemplate,
  periodRecords: ReadonlyArray<TemplatePeriodRecord | TemplatePeriodConfig>,
): Effect.Effect<PlanTemplateWithPeriods, PlanTemplateRepositoryError> => {
  // For TemplatePeriodRecords, strip DB fields to match TemplatePeriodConfig shape
  const periods = periodRecords.map((p) =>
    'planTemplateId' in p ? { order: p.order, fastingDuration: p.fastingDuration, eatingWindow: p.eatingWindow } : p,
  );

  return S.decodeUnknown(PlanTemplateWithPeriods)({
    ...templateRecord,
    periods,
  }).pipe(
    Effect.mapError(
      (error) =>
        new PlanTemplateRepositoryError({
          message: 'Failed to decode PlanTemplateWithPeriods domain entity',
          cause: error,
        }),
    ),
  );
};
