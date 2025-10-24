import { Schema as S } from 'effect';

/**
 * Response Decoders
 *
 * These are plain S.Struct schemas used ONLY for decoding/validating
 * JSON responses. They don't create class instances.
 *
 * Usage:
 *   S.decodeUnknown(CycleRepositoryErrorDecoder)(json)
 */

export const CycleRepositoryErrorDecoder = S.Struct({
  _tag: S.Literal('CycleRepositoryError'),
  message: S.String,
  cause: S.optional(S.Unknown),
});

export const CycleActorErrorDecoder = S.Struct({
  _tag: S.Literal('CycleActorError'),
  message: S.String,
  cause: S.optional(S.Unknown),
});

export const DomainErrorDecoder = S.Union(CycleRepositoryErrorDecoder, CycleActorErrorDecoder);
