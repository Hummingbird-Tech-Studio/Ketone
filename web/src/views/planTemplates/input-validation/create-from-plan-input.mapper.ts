/**
 * CreateFromPlanInput Schema
 *
 * Validates the planId for the "Save as Template" flow.
 * Ensures the planId is a valid UUID before the composable sends it to the actor.
 */
import { PlanId } from '@/views/plan/domain/plan.model';
import type { CreateFromPlanInput } from '@/views/planTemplates/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw input — planId as string from route params or context.
 */
class CreateFromPlanRawInput extends S.Class<CreateFromPlanRawInput>('CreateFromPlanRawInput')({
  planId: PlanId,
}) {}

// ============================================
// 2. DOMAIN INPUT TYPE (output after validation)
// ============================================

/**
 * Domain-typed input — planId subset of the full contract input.
 * Actor merges this with context (currentCount, maxTemplates) for the full contract input.
 */
type CreateFromPlanDomainInput = Pick<CreateFromPlanInput, 'planId'>;

// ============================================
// 3. VALIDATION FUNCTION
// ============================================

/**
 * validateCreateFromPlanInput
 *
 * Validates planId as UUID format.
 * Returns Either: Right(DomainInput) for success, Left(ParseError) for validation failures.
 */
export const validateCreateFromPlanInput = (raw: unknown): Either.Either<CreateFromPlanDomainInput, ParseError> =>
  S.decodeUnknownEither(CreateFromPlanRawInput)(raw).pipe(
    Either.map(
      (validated): CreateFromPlanDomainInput => ({
        planId: validated.planId,
      }),
    ),
  );
