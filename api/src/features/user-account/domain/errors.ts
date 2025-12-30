import { Data } from 'effect';

export class InvalidPasswordError extends Data.TaggedError('InvalidPasswordError')<{
  readonly message: string;
  readonly remainingAttempts: number;
}> {}

export class TooManyRequestsError extends Data.TaggedError('TooManyRequestsError')<{
  readonly message: string;
  readonly remainingAttempts: number;
  readonly retryAfter: number;
}> {}

export class EmailAlreadyInUseError extends Data.TaggedError('EmailAlreadyInUseError')<{
  readonly message: string;
  readonly email: string;
}> {}

export class SameEmailError extends Data.TaggedError('SameEmailError')<{
  readonly message: string;
}> {}

export class SamePasswordError extends Data.TaggedError('SamePasswordError')<{
  readonly message: string;
}> {}

export class UserAccountServiceError extends Data.TaggedError('UserAccountServiceError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
