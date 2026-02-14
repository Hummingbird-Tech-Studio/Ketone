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
import type { SaveTimelineInput } from '@/views/plan/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import { MAX_PERIODS, MIN_PERIODS, PeriodUpdateInputSchema, PlanDetail, PlanId } from '../plan.model';

// ============================================
// RAW INPUT SCHEMA (what comes from composable)
// ============================================

/**
 * Raw input from the composable for saving timeline changes.
 * originalPlan is validated as PlanDetail instance (already domain-typed from actor context).
 */
export class SaveTimelineRawInput extends S.Class<SaveTimelineRawInput>('SaveTimelineRawInput')({
  planId: PlanId,
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
// VALIDATION FUNCTION
// ============================================

/**
 * validateSaveTimelineInput
 *
 * Transforms composable-assembled input into domain-typed input.
 */
export const validateSaveTimelineInput = (raw: unknown): Either.Either<SaveTimelineInput, ParseError> =>
  S.decodeUnknownEither(SaveTimelineRawInput)(raw).pipe(
    Either.map(
      (validated): SaveTimelineInput => ({
        planId: validated.planId,
        originalPlan: validated.originalPlan,
        ...(validated.currentStartDate !== undefined && { currentStartDate: validated.currentStartDate }),
        ...(validated.currentPeriods !== undefined && {
          currentPeriods: validated.currentPeriods.map((p) => ({
            ...(p.id !== undefined && { id: p.id }),
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
          })),
        }),
      }),
    ),
  );
