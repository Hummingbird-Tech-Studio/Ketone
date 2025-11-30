import { Data } from 'effect';

export class ProfileServiceError extends Data.TaggedError('ProfileServiceError')<{
  message: string;
  cause?: unknown;
}> {}
