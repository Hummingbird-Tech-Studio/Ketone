import { Schema as S } from 'effect';

export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}
