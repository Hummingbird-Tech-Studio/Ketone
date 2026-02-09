/**
 * UpdateTemplateInput Schema
 *
 * Validates raw form input from the template edit screen and
 * transforms it into domain-typed input for the actor.
 *
 * Transformations:
 * - name: string → PlanName (1-100 chars)
 * - description: string → PlanDescription | null (empty string → null)
 * - periods: array of { fastingDuration, eatingWindow } → validated with domain constraints
 */
import { Schema as S, Either } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MIN_PLAN_NAME_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_DESCRIPTION_LENGTH,
  type PlanName,
  type PlanDescription,
  type FastingDuration,
  type EatingWindow,
} from '../plan-template.model';
import {
  MIN_FASTING_DURATION_HOURS,
  MAX_FASTING_DURATION_HOURS,
  MIN_EATING_WINDOW_HOURS,
  MAX_EATING_WINDOW_HOURS,
  MIN_PERIODS,
  MAX_PERIODS,
} from '../../../plan/constants';

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
export class UpdateTemplateRawInput extends S.Class<UpdateTemplateRawInput>(
  'UpdateTemplateRawInput',
)({
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
export interface UpdateTemplateDomainInput {
  readonly name: PlanName;
  readonly description: PlanDescription | null;
  readonly periods: ReadonlyArray<{
    readonly fastingDuration: FastingDuration;
    readonly eatingWindow: EatingWindow;
  }>;
}

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateUpdateTemplateInput
 *
 * Transforms raw UI input into domain-typed input.
 * Returns Either: Right(DomainInput) for success, Left(ParseError) for validation failures.
 *
 * Empty description string is transformed to null.
 * Actor only receives validated domain types from the composable.
 */
export const validateUpdateTemplateInput = (
  raw: unknown,
): Either.Either<UpdateTemplateDomainInput, ParseError> =>
  S.decodeUnknownEither(UpdateTemplateRawInput)(raw).pipe(
    Either.map(
      (validated): UpdateTemplateDomainInput => ({
        name: validated.name as PlanName,
        description: validated.description.trim() === '' ? null : (validated.description as PlanDescription),
        periods: validated.periods.map((p) => ({
          fastingDuration: p.fastingDuration as FastingDuration,
          eatingWindow: p.eatingWindow as EatingWindow,
        })),
      }),
    ),
  );

// ============================================
// 4. ERROR EXTRACTION
// ============================================

/**
 * extractSchemaErrors
 *
 * Converts ParseError into a standardized Record<string, string[]> for UI display.
 * Each key is a field name, each value is an array of error messages for that field.
 */
export const extractSchemaErrors = (
  error: ParseError,
): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};

  const extractFromIssue = (issue: ParseError['issue'], fieldPath?: string) => {
    if (issue._tag === 'Composite') {
      for (const inner of issue.issues) {
        extractFromIssue(inner, fieldPath);
      }
    } else if (issue._tag === 'Pointer') {
      const currentPath = fieldPath
        ? `${fieldPath}.${String(issue.path)}`
        : String(issue.path);
      extractFromIssue(issue.issue, currentPath);
    } else if (issue._tag === 'Refinement' || issue._tag === 'Type') {
      const msg =
        'message' in issue && typeof issue.message === 'string'
          ? issue.message
          : 'Invalid value';
      const field = fieldPath ?? '_general';
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(msg);
    }
  };

  extractFromIssue(error.issue);
  return errors;
};
