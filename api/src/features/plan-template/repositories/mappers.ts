import { Effect, Schema as S } from 'effect';
import { PlanTemplate, TemplatePeriodConfig, PlanTemplateWithPeriods } from '../domain';
import { PlanTemplateRepositoryError } from './errors';
import type { PlanTemplateRecord, TemplatePeriodRecord } from './schemas';

/**
 * Boundary mappers: DB DTO (PlanTemplateRecord/TemplatePeriodRecord) → Domain Entity.
 *
 * The repository schemas handle format transforms (NumericFromString, DateFromSelf).
 * These mappers apply branded type validation, producing fully validated domain entities.
 */

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
