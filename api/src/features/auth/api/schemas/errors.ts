import { Schema as S } from 'effect';

/**
 * API Error Schemas
 * These are S.TaggedError schemas that can be used in HTTP API responses
 */

export class UserAlreadyExistsErrorSchema extends S.TaggedError<UserAlreadyExistsErrorSchema>()(
  'UserAlreadyExistsError',
  {
    message: S.String,
    email: S.String,
  },
) {}

export class InvalidCredentialsErrorSchema extends S.TaggedError<InvalidCredentialsErrorSchema>()(
  'InvalidCredentialsError',
  {
    message: S.String,
  },
) {}

export class PasswordHashErrorSchema extends S.TaggedError<PasswordHashErrorSchema>()('PasswordHashError', {
  message: S.String,
}) {}

export class UserRepositoryErrorSchema extends S.TaggedError<UserRepositoryErrorSchema>()('UserRepositoryError', {
  message: S.String,
}) {}

export class JwtGenerationErrorSchema extends S.TaggedError<JwtGenerationErrorSchema>()('JwtGenerationError', {
  message: S.String,
}) {}

export class UserAuthClientErrorSchema extends S.TaggedError<UserAuthClientErrorSchema>()('UserAuthClientError', {
  message: S.String,
}) {}
