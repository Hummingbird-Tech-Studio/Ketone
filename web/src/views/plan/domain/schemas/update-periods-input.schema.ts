/**
 * UpdatePeriodsInput Schema
 *
 * Validates raw form input for updating a plan's period durations.
 *
 * Transformations:
 * - planId: string → PlanId (UUID)
 * - periods: array of { id?: PeriodId, fastingDuration: FastingDuration, eatingWindow: EatingWindow }
 */
import type { UpdatePeriodsInput } from '@/views/plan/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import { MAX_PERIODS, MIN_PERIODS, PlanId, PlanPeriodUpdate } from '../plan.model';

// ============================================
// RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input for period updates.
 */
export class UpdatePeriodsRawInput extends S.Class<UpdatePeriodsRawInput>('UpdatePeriodsRawInput')({
  planId: PlanId,
  periods: S.Array(PlanPeriodUpdate).pipe(
    S.minItems(MIN_PERIODS, {
      message: () => `At least ${MIN_PERIODS} period required`,
    }),
    S.maxItems(MAX_PERIODS, {
      message: () => `At most ${MAX_PERIODS} periods allowed`,
    }),
  ),
}) {}

// ============================================
// VALIDATION FUNCTION
// ============================================

/**
 * validateUpdatePeriodsInput
 *
 * Transforms raw UI input into domain-typed input.
 */
export const validateUpdatePeriodsInput = (raw: unknown): Either.Either<UpdatePeriodsInput, ParseError> =>
  S.decodeUnknownEither(UpdatePeriodsRawInput)(raw).pipe(
    Either.map(
      (validated): UpdatePeriodsInput => ({
        planId: validated.planId,
        periods: validated.periods.map((p) => ({
          ...(p.id !== undefined && { id: p.id }),
          fastingDuration: p.fastingDuration,
          eatingWindow: p.eatingWindow,
        })),
      }),
    ),
  );
