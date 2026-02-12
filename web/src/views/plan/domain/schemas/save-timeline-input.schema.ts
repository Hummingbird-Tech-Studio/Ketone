/**
 * SaveTimelineInput Schema
 *
 * Validates input for the plan edit save flow.
 * The composable assembles this from actor context (planId, originalPlan)
 * and form state (currentStartDate, currentPeriods).
 *
 * Transformations:
 * - planId: string → PlanId (UUID)
 * - originalPlan: PlanDetail (already domain-typed from actor context)
 * - currentStartDate: Date | undefined → Date | undefined
 * - currentPeriods: array | undefined → validated period updates | undefined
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
  PlanDetail,
  type EatingWindow,
  type FastingDuration,
  type PeriodId,
  type PlanId,
} from '../plan.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from composable)
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
 * Raw input from the composable for saving timeline changes.
 * originalPlan is validated as PlanDetail instance (already domain-typed from actor context).
 */
export class SaveTimelineRawInput extends S.Class<SaveTimelineRawInput>('SaveTimelineRawInput')({
  planId: S.UUID,
  originalPlan: S.instanceOf(PlanDetail),
  currentStartDate: S.optional(S.DateFromSelf),
  currentPeriods: S.optional(
    S.Array(PeriodUpdateInputSchema).pipe(
      S.minItems(MIN_PERIODS, {
        message: () => `At least ${MIN_PERIODS} period required`,
      }),
      S.maxItems(MAX_PERIODS, {
        message: () => `At most ${MAX_PERIODS} periods allowed`,
      }),
    ),
  ),
}) {}

// ============================================
// 2. DOMAIN INPUT TYPE (output after validation)
// ============================================

/**
 * Domain-typed input for saving timeline changes.
 */
export interface SaveTimelineDomainInput {
  readonly planId: PlanId;
  readonly originalPlan: PlanDetail;
  readonly currentStartDate?: Date;
  readonly currentPeriods?: ReadonlyArray<{
    readonly id?: PeriodId;
    readonly fastingDuration: FastingDuration;
    readonly eatingWindow: EatingWindow;
  }>;
}

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateSaveTimelineInput
 *
 * Transforms composable-assembled input into domain-typed input.
 */
export const validateSaveTimelineInput = (raw: unknown): Either.Either<SaveTimelineDomainInput, ParseError> =>
  S.decodeUnknownEither(SaveTimelineRawInput)(raw).pipe(
    Either.map(
      (validated): SaveTimelineDomainInput => ({
        planId: validated.planId as PlanId,
        originalPlan: validated.originalPlan,
        ...(validated.currentStartDate !== undefined && { currentStartDate: validated.currentStartDate }),
        ...(validated.currentPeriods !== undefined && {
          currentPeriods: validated.currentPeriods.map((p) => ({
            ...(p.id !== undefined && { id: p.id as PeriodId }),
            fastingDuration: p.fastingDuration as FastingDuration,
            eatingWindow: p.eatingWindow as EatingWindow,
          })),
        }),
      }),
    ),
  );
