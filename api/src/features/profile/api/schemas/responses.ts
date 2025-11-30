import { Schema as S } from 'effect';

export const ProfileResponseSchema = S.Struct({
  id: S.String,
  userId: S.String,
  name: S.NullOr(S.String),
  dateOfBirth: S.NullOr(S.String),
  createdAt: S.Date,
  updatedAt: S.Date,
});

export type ProfileResponse = S.Schema.Type<typeof ProfileResponseSchema>;
