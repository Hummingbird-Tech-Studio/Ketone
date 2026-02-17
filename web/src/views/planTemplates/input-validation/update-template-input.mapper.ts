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
import {
  EatingWindowSchema,
  FastingDurationSchema,
  MAX_PERIODS,
  MIN_PERIODS,
  PlanDescriptionSchema,
  PlanNameSchema,
  type PlanDescription,
  type PlanName,
} from '@/views/plan/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import type { TemplatePeriodConfig } from '../domain/plan-template.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

const PeriodInputSchema = S.Struct({
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
});

/**
 * Raw form input — validates and brands in one step.
 */
class UpdateTemplateRawInput extends S.Class<UpdateTemplateRawInput>('UpdateTemplateRawInput')({
  name: PlanNameSchema,
  description: PlanDescriptionSchema,
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
        name: validated.name,
        description: validated.description.trim() === '' ? null : validated.description,
        periods: validated.periods.map((p) => ({
          fastingDuration: p.fastingDuration,
          eatingWindow: p.eatingWindow,
        })),
      }),
    ),
  );
