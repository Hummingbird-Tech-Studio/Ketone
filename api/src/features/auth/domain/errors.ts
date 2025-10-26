import { Data } from 'effect';

/**
 * Domain errors for authentication operations
 */

export class UserAlreadyExistsError extends Data.TaggedError('UserAlreadyExistsError')<{
  readonly message: string;
  readonly email: string;
}> {}

export class InvalidCredentialsError extends Data.TaggedError('InvalidCredentialsError')<{
  readonly message: string;
}> {}

export class PasswordHashError extends Data.TaggedError('PasswordHashError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
