import { Schema as S } from 'effect';
import { HttpApiSchema } from '@effect/platform';

/**
 * Error Schemas for HTTP API
 *
 * These are S.TaggedError schemas used for encoding/decoding errors
 * in HTTP API responses. They work with @effect/platform HttpApi.
 *
 * Usage:
 *   - API Contract: .addError(CycleActorErrorSchema)
 *   - Encoding: Effect.fail(new CycleActorErrorSchema({ message: "..." }))
 *   - Decoding: Automatic by @effect/platform
 *
 * These schemas can both encode (runtime error → JSON) and decode (JSON → error).
 */

export class CycleActorErrorSchema extends S.TaggedError<CycleActorErrorSchema>()('CycleActorErrorSchema', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}

export class CycleRepositoryErrorSchema extends S.TaggedError<CycleRepositoryErrorSchema>()('CycleRepositoryErrorSchema', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}

export class OrleansClientErrorSchema extends S.TaggedError<OrleansClientErrorSchema>()('OrleansClientErrorSchema', {
  message: S.String,
  cause: S.optional(S.Unknown),
}) {}

export class OrleansActorNotFoundErrorSchema extends S.TaggedError<OrleansActorNotFoundErrorSchema>()(
  'OrleansActorNotFoundErrorSchema',
  {
    actorId: S.String,
    message: S.String,
  },
) {}

export class CycleAlreadyInProgressErrorSchema extends S.TaggedError<CycleAlreadyInProgressErrorSchema>()(
  'CycleAlreadyInProgressErrorSchema',
  {
    message: S.String,
    userId: S.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}
