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

export class JwtGenerationError extends Data.TaggedError('JwtGenerationError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class JwtVerificationError extends Data.TaggedError('JwtVerificationError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class JwtConfigError extends Data.TaggedError('JwtConfigError')<{
  readonly message: string;
}> {}

export class PasswordResetTokenError extends Data.TaggedError('PasswordResetTokenError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class PasswordResetTokenExpiredError extends Data.TaggedError('PasswordResetTokenExpiredError')<{
  readonly message: string;
}> {}

export class PasswordResetTokenInvalidError extends Data.TaggedError('PasswordResetTokenInvalidError')<{
  readonly message: string;
}> {}

export class EmailSendError extends Data.TaggedError('EmailSendError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
