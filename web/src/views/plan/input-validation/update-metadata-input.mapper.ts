/**
 * UpdateMetadataInput Schema
 *
 * Validates raw form input for updating a plan's name, description, or start date.
 * Partial update — only provided fields are validated and sent.
 *
 * Transformations:
 * - planId: string → PlanId (UUID)
 * - name: string | undefined → PlanName | undefined
 * - description: string | undefined → PlanDescription | null | undefined (empty → null)
 * - startDate: Date | undefined → Date | undefined
 */
import type { UpdateMetadataInput } from '@/views/plan/domain';
import { PlanDescriptionSchema, PlanId, PlanNameSchema } from '@/views/plan/domain';
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';

// ============================================
// RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input for metadata update.
 * planId is always required; name, description, startDate are optional.
 */
class UpdateMetadataRawInput extends S.Class<UpdateMetadataRawInput>('UpdateMetadataRawInput')({
  planId: PlanId,
  name: S.optional(PlanNameSchema),
  description: S.optional(PlanDescriptionSchema),
  startDate: S.optional(S.DateFromSelf),
}) {}

// ============================================
// VALIDATION FUNCTION
// ============================================

/**
 * validateUpdateMetadataInput
 *
 * Transforms raw UI input into domain-typed input.
 * Empty description string is transformed to null.
 */
export const validateUpdateMetadataInput = (raw: unknown): Either.Either<UpdateMetadataInput, ParseError> =>
  S.decodeUnknownEither(UpdateMetadataRawInput)(raw).pipe(
    Either.map(
      (validated): UpdateMetadataInput => ({
        planId: validated.planId,
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.description !== undefined && {
          description: validated.description.trim() === '' ? null : validated.description,
        }),
        ...(validated.startDate !== undefined && { startDate: validated.startDate }),
      }),
    ),
  );
