import { Schema as S } from 'effect';

export const ProfileResponseSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  name: S.NullOr(S.String),
  dateOfBirth: S.NullOr(S.String),
  createdAt: S.Date,
  updatedAt: S.Date,
});

export type ProfileResponse = S.Schema.Type<typeof ProfileResponseSchema>;

export const NullableProfileResponseSchema = S.NullOr(ProfileResponseSchema);

export type NullableProfileResponse = S.Schema.Type<typeof NullableProfileResponseSchema>;
