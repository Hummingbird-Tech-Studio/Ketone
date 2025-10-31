import { Data } from 'effect';

export class OrleansClientError extends Data.TaggedError('OrleansClientError')<{
  message: string;
  cause?: unknown;
}> {}

export class OrleansActorNotFoundError extends Data.TaggedError('OrleansActorNotFoundError')<{
  userId: string;
  message: string;
}> {}
