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
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MAX_PERIODS,
  MAX_PLAN_DESCRIPTION_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  MIN_PERIODS,
  MIN_PLAN_NAME_LENGTH,
  PeriodUpdateInputSchema,
  type EatingWindow,
  type FastingDuration,
  type PlanDescription,
  type PlanName,
} from '../plan.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input — all values as UI provides them.
 * No branded types, no domain validation.
 */
export class CreatePlanRawInput extends S.Class<CreatePlanRawInput>('CreatePlanRawInput')({
  name: S.String.pipe(
    S.minLength(MIN_PLAN_NAME_LENGTH, {
      message: () => 'Name is required',
    }),
    S.maxLength(MAX_PLAN_NAME_LENGTH, {
      message: () => `Name must be at most ${MAX_PLAN_NAME_LENGTH} characters`,
    }),
  ),
  description: S.String.pipe(
    S.maxLength(MAX_PLAN_DESCRIPTION_LENGTH, {
      message: () => `Description must be at most ${MAX_PLAN_DESCRIPTION_LENGTH} characters`,
    }),
  ),
  startDate: S.DateFromSelf,
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
        name: validated.name as PlanName,
        description: validated.description.trim() === '' ? null : (validated.description as PlanDescription),
        startDate: validated.startDate,
        periods: validated.periods.map((p) => ({
          fastingDuration: p.fastingDuration as FastingDuration,
          eatingWindow: p.eatingWindow as EatingWindow,
        })),
      }),
    ),
  );

