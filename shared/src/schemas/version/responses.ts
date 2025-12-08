import { Schema as S } from 'effect';

/**
 * Version Response Schemas
 * Shared schemas for version API responses
 */

/**
 * Version Response Schema
 * Response from GET /v1/version
 */
export class VersionResponseSchema extends S.Class<VersionResponseSchema>('VersionResponseSchema')({
  version: S.String.pipe(S.minLength(1)),
  buildTime: S.optional(S.String),
}) {}
