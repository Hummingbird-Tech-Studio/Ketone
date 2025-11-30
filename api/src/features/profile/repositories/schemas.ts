import { Schema as S } from 'effect';

const ProfileDataSchema = S.Struct({
  userId: S.UUID,
  name: S.NullOr(S.String),
  dateOfBirth: S.NullOr(S.String),
});

export const ProfileRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.NullOr(S.String),
  dateOfBirth: S.NullOr(S.DateFromSelf),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Type inference from schemas
export type ProfileData = S.Schema.Type<typeof ProfileDataSchema>;
export type ProfileRecord = S.Schema.Type<typeof ProfileRecordSchema>;
