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
import { Either, ParseResult, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MAX_EATING_WINDOW_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MAX_PERIODS,
  MAX_PLAN_DESCRIPTION_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  MIN_EATING_WINDOW_HOURS,
  MIN_FASTING_DURATION_HOURS,
  MIN_PERIODS,
  MIN_PLAN_NAME_LENGTH,
  type EatingWindow,
  type FastingDuration,
  type PlanDescription,
  type PlanName,
} from '../plan.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

const PeriodInputSchema = S.Struct({
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
  periods: S.Array(PeriodInputSchema).pipe(
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
 * Domain-typed input — branded types and value objects.
 * This is what the actor receives after composable validates.
 */
export interface CreatePlanDomainInput {
  readonly name: PlanName;
  readonly description: PlanDescription | null;
  readonly startDate: Date;
  readonly periods: ReadonlyArray<{
    readonly fastingDuration: FastingDuration;
    readonly eatingWindow: EatingWindow;
  }>;
}

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateCreatePlanInput
 *
 * Transforms raw UI input into domain-typed input.
 * Returns Either: Right(DomainInput) for success, Left(ParseError) for validation failures.
 *
 * Empty description string is transformed to null.
 * Actor only receives validated domain types from the composable.
 */
export const validateCreatePlanInput = (raw: unknown): Either.Either<CreatePlanDomainInput, ParseError> =>
  S.decodeUnknownEither(CreatePlanRawInput)(raw).pipe(
    Either.map(
      (validated): CreatePlanDomainInput => ({
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

// ============================================
// 4. ERROR EXTRACTION (shared across schemas)
// ============================================

/**
 * extractSchemaErrors
 *
 * Converts ParseError into a standardized Record<string, string[]> for UI display.
 * Each key is a dot-joined field path, each value is an array of error messages.
 * Uses Effect's built-in ArrayFormatter instead of manual AST traversal.
 */
export const extractSchemaErrors = (error: ParseError): Record<string, string[]> => {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_general';
    if (!errors[key]) {
      errors[key] = [];
    }
    errors[key].push(issue.message);
  }
  return errors;
};
