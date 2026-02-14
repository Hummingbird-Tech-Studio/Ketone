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
import { Either, Schema as S } from 'effect';
import type { ParseError } from 'effect/ParseResult';
import {
  MAX_PLAN_DESCRIPTION_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  MIN_PLAN_NAME_LENGTH,
  type PlanDescription,
  type PlanId,
  type PlanName,
} from '../plan.model';

// ============================================
// 1. RAW INPUT SCHEMA (what comes from UI)
// ============================================

/**
 * Raw form input for metadata update.
 * planId is always required; name, description, startDate are optional.
 */
export class UpdateMetadataRawInput extends S.Class<UpdateMetadataRawInput>('UpdateMetadataRawInput')({
  planId: S.UUID,
  name: S.optional(
    S.String.pipe(
      S.minLength(MIN_PLAN_NAME_LENGTH, {
        message: () => 'Name is required',
      }),
      S.maxLength(MAX_PLAN_NAME_LENGTH, {
        message: () => `Name must be at most ${MAX_PLAN_NAME_LENGTH} characters`,
      }),
    ),
  ),
  description: S.optional(
    S.String.pipe(
      S.maxLength(MAX_PLAN_DESCRIPTION_LENGTH, {
        message: () => `Description must be at most ${MAX_PLAN_DESCRIPTION_LENGTH} characters`,
      }),
    ),
  ),
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
        planId: validated.planId as PlanId,
        ...(validated.name !== undefined && { name: validated.name as PlanName }),
        ...(validated.description !== undefined && {
          description: validated.description.trim() === '' ? null : (validated.description as PlanDescription),
        }),
        ...(validated.startDate !== undefined && { startDate: validated.startDate }),
      }),
    ),
  );
