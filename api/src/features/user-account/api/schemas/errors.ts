import { Schema as S } from 'effect';

/**
 * API Error Schemas for User Account operations
 * These are S.TaggedError schemas that can be used in HTTP API responses
 */

export class InvalidPasswordErrorSchema extends S.TaggedError<InvalidPasswordErrorSchema>()('InvalidPasswordError', {
  message: S.String,
  remainingAttempts: S.Number,
}) {}

export class TooManyRequestsErrorSchema extends S.TaggedError<TooManyRequestsErrorSchema>()('TooManyRequestsError', {
  message: S.String,
  remainingAttempts: S.Number,
  retryAfter: S.Number,
}) {}

export class EmailAlreadyInUseErrorSchema extends S.TaggedError<EmailAlreadyInUseErrorSchema>()(
  'EmailAlreadyInUseError',
  {
    message: S.String,
    email: S.String,
  },
) {}

export class SameEmailErrorSchema extends S.TaggedError<SameEmailErrorSchema>()('SameEmailError', {
  message: S.String,
}) {}

export class SamePasswordErrorSchema extends S.TaggedError<SamePasswordErrorSchema>()('SamePasswordError', {
  message: S.String,
}) {}

export class UserAccountServiceErrorSchema extends S.TaggedError<UserAccountServiceErrorSchema>()(
  'UserAccountServiceError',
  {
    message: S.String,
    cause: S.optional(S.Unknown),
  },
) {}
