/**
 * CreatePlanInput Schema
 *
 * Validates raw form input from the plan creation screen and
 * transforms it into domain-typed input for the actor.
 *
 * Transformations:
 * - name: string → PlanName (1-100 chars)
 * - description: string → PlanDescription | null (empty string → null)
 * - startDate: Date → Date (pass-through, from date picker)
 * - periods: array of { fastingDuration, eatingWindow } → validated with domain constraints
 */
import type { CreatePlanInput } from '@/views/plan/domain';
import { MAX_PERIODS, MIN_PERIODS, PlanDescriptionSchema, PlanNameSchema, PlanPeriodUpdate } from '@/views/plan/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';

// ============================================
// RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input — validates and brands in one step.
 */
class CreatePlanRawInput extends S.Class<CreatePlanRawInput>('CreatePlanRawInput')({
  name: PlanNameSchema,
  description: PlanDescriptionSchema,
  startDate: S.DateFromSelf,
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
 * validateCreatePlanInput
 *
 * Transforms raw UI input into domain-typed input.
 * Returns Either: Right(CreatePlanInput) for success, Left(ParseError) for validation failures.
 *
 * Empty description string is transformed to null.
 * Actor only receives validated domain types from the composable.
 */
export const validateCreatePlanInput = (raw: unknown): Either.Either<CreatePlanInput, ParseError> =>
  S.decodeUnknownEither(CreatePlanRawInput)(raw).pipe(
    Either.map(
      (validated): CreatePlanInput => ({
        name: validated.name,
        description: validated.description.trim() === '' ? null : validated.description,
        startDate: validated.startDate,
        periods: validated.periods.map((p) => ({
          fastingDuration: p.fastingDuration,
          eatingWindow: p.eatingWindow,
        })),
      }),
    ),
  );
