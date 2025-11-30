import { Schema as S } from 'effect';

export class ProfileRepositoryErrorSchema extends S.TaggedError<ProfileRepositoryErrorSchema>()(
  'ProfileRepositoryError',
  {
    message: S.String,
    cause: S.optional(S.Unknown),
  },
) {}
