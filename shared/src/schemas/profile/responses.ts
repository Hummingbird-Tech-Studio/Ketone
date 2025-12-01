import { Schema as S } from 'effect';

// Enums for physical info
export const GenderSchema = S.Literal('Male', 'Female', 'Prefer not to say');
export const WeightUnitSchema = S.Literal('kg', 'lbs');
export const HeightUnitSchema = S.Literal('cm', 'ft_in');

export type Gender = S.Schema.Type<typeof GenderSchema>;
export type WeightUnit = S.Schema.Type<typeof WeightUnitSchema>;
export type HeightUnit = S.Schema.Type<typeof HeightUnitSchema>;

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

// Physical info response schema
export const PhysicalInfoResponseSchema = S.Struct({
  weight: S.NullOr(S.Number),
  height: S.NullOr(S.Number),
  gender: S.NullOr(GenderSchema),
  weightUnit: S.NullOr(WeightUnitSchema),
  heightUnit: S.NullOr(HeightUnitSchema),
  age: S.NullOr(S.Number),
});

export type PhysicalInfoResponse = S.Schema.Type<typeof PhysicalInfoResponseSchema>;

export const NullablePhysicalInfoResponseSchema = S.NullOr(PhysicalInfoResponseSchema);

export type NullablePhysicalInfoResponse = S.Schema.Type<typeof NullablePhysicalInfoResponseSchema>;
