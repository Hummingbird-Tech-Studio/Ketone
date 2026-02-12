/**
 * UpdatePeriodsInput Schema
 *
 * Validates raw form input for updating a plan's period durations.
 *
 * Transformations:
 * - planId: string → PlanId (UUID)
 * - periods: array of { id?: string, fastingDuration: number, eatingWindow: number }
 *           → validated with domain constraints, id as PlanId | undefined
 */
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
  type EatingWindow,
  type FastingDuration,
  type PeriodId,
  type PlanId,
} from '../plan.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

const PeriodUpdateInputSchema = S.Struct({
  id: S.optional(S.UUID),
  fastingDuration: S.Number.pipe(
    S.greaterThanOrEqualTo(MIN_FASTING_DURATION_HOURS, {
      message: () => `Fasting duration must be at least ${MIN_FASTING_DURATION_HOURS}h`,
    }),
    S.lessThanOrEqualTo(MAX_FASTING_DURATION_HOURS, {
      message: () => `Fasting duration must be at most ${MAX_FASTING_DURATION_HOURS}h`,
    }),
  ),
  eatingWindow: S.Number.pipe(
    S.greaterThanOrEqualTo(MIN_EATING_WINDOW_HOURS, {
      message: () => `Eating window must be at least ${MIN_EATING_WINDOW_HOURS}h`,
    }),
    S.lessThanOrEqualTo(MAX_EATING_WINDOW_HOURS, {
      message: () => `Eating window must be at most ${MAX_EATING_WINDOW_HOURS}h`,
    }),
  ),
});

/**
 * Raw form input for period updates.
 */
export class UpdatePeriodsRawInput extends S.Class<UpdatePeriodsRawInput>('UpdatePeriodsRawInput')({
  planId: S.UUID,
  periods: S.Array(PeriodUpdateInputSchema).pipe(
    S.minItems(MIN_PERIODS, {
      message: () => `At least ${MIN_PERIODS} period required`,
    }),
    S.maxItems(MAX_PERIODS, {
      message: () => `At most ${MAX_PERIODS} periods allowed`,
    }),
  ),
}) {}

// ============================================
// 2. DOMAIN INPUT TYPE (output after validation)
// ============================================

/**
 * Domain-typed input for period updates.
 */
export interface UpdatePeriodsDomainInput {
  readonly planId: PlanId;
  readonly periods: ReadonlyArray<{
    readonly id?: PeriodId;
    readonly fastingDuration: FastingDuration;
    readonly eatingWindow: EatingWindow;
  }>;
}

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateUpdatePeriodsInput
 *
 * Transforms raw UI input into domain-typed input.
 */
export const validateUpdatePeriodsInput = (raw: unknown): Either.Either<UpdatePeriodsDomainInput, ParseError> =>
  S.decodeUnknownEither(UpdatePeriodsRawInput)(raw).pipe(
    Either.map(
      (validated): UpdatePeriodsDomainInput => ({
        planId: validated.planId as PlanId,
        periods: validated.periods.map((p) => ({
          ...(p.id !== undefined && { id: p.id as PeriodId }),
          fastingDuration: p.fastingDuration as FastingDuration,
          eatingWindow: p.eatingWindow as EatingWindow,
        })),
      }),
    ),
  );
