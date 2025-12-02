import { Data } from 'effect';

export class InvalidPasswordError extends Data.TaggedError('InvalidPasswordError')<{
  message: string;
}> {}

export class EmailAlreadyInUseError extends Data.TaggedError('EmailAlreadyInUseError')<{
  message: string;
  email: string;
}> {}

export class SameEmailError extends Data.TaggedError('SameEmailError')<{
  message: string;
}> {}

export class UserAccountServiceError extends Data.TaggedError('UserAccountServiceError')<{
  message: string;
  cause?: unknown;
}> {}
