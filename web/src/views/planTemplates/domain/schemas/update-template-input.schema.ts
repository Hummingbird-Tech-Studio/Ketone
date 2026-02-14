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
import { Either, Schema as S } from 'effect';
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
} from '@/views/plan/domain';
import type { TemplatePeriodConfig } from '../plan-template.model';

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
export class UpdateTemplateRawInput extends S.Class<UpdateTemplateRawInput>('UpdateTemplateRawInput')({
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
 * Domain-typed input — derived from contract schema via S.omit.
 * Periods omit `order` since the actor assigns it positionally.
 * This is what the actor receives after composable validates.
 */
export type UpdateTemplateDomainInput = {
  readonly name: PlanName;
  readonly description: PlanDescription | null;
  readonly periods: ReadonlyArray<Omit<TemplatePeriodConfig, 'order'>>;
};

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
export const validateUpdateTemplateInput = (raw: unknown): Either.Either<UpdateTemplateDomainInput, ParseError> =>
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
