import { Schema as S } from 'effect';

// Enums for physical info
export const GenderEnum = S.Literal('Male', 'Female', 'Prefer not to say');
export const WeightUnitEnum = S.Literal('kg', 'lbs');
export const HeightUnitEnum = S.Literal('cm', 'ft_in');

// Schema to parse numeric strings from DB to numbers
const NumericFromString = S.transform(S.NullOr(S.String), S.NullOr(S.Number), {
  decode: (s) => (s === null ? null : parseFloat(s)),
  encode: (n) => (n === null ? null : n.toString()),
});

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
  // Physical info fields
  weight: NumericFromString,
  height: NumericFromString,
  gender: S.NullOr(GenderEnum),
  weightUnit: S.NullOr(WeightUnitEnum),
  heightUnit: S.NullOr(HeightUnitEnum),
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});

// Type inference from schemas
export type ProfileData = S.Schema.Type<typeof ProfileDataSchema>;
export type ProfileRecord = S.Schema.Type<typeof ProfileRecordSchema>;
export type Gender = S.Schema.Type<typeof GenderEnum>;
export type WeightUnit = S.Schema.Type<typeof WeightUnitEnum>;
export type HeightUnit = S.Schema.Type<typeof HeightUnitEnum>;
