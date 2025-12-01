import { Schema as S } from 'effect';
import { GenderSchema, WeightUnitSchema, HeightUnitSchema } from '@ketone/shared';

// Date format: YYYY-MM-DD (ISO 8601 date only)
const DateOnlyString = S.String.pipe(
  S.pattern(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
  S.annotations({ description: 'Date in YYYY-MM-DD format' }),
);

// Name: non-empty string with max length matching database varchar(255)
const NameString = S.String.pipe(
  S.minLength(1),
  S.maxLength(255),
  S.annotations({ description: 'User name (1-255 characters)' }),
);

export const SaveProfileSchema = S.Struct({
  name: S.optional(S.NullOr(NameString)),
  dateOfBirth: S.optional(S.NullOr(DateOnlyString)),
});

export type SaveProfilePayload = S.Schema.Type<typeof SaveProfileSchema>;

// Physical info validation schemas
const WeightSchema = S.Number.pipe(
  S.greaterThanOrEqualTo(30),
  S.lessThanOrEqualTo(300),
  S.annotations({ description: 'Weight in kg (30-300)' }),
);

const HeightSchema = S.Number.pipe(
  S.greaterThanOrEqualTo(120),
  S.lessThanOrEqualTo(250),
  S.annotations({ description: 'Height in cm (120-250)' }),
);

export const SavePhysicalInfoSchema = S.Struct({
  weight: S.optional(S.NullOr(WeightSchema)),
  height: S.optional(S.NullOr(HeightSchema)),
  gender: S.optional(S.NullOr(GenderSchema)),
  weightUnit: S.optional(S.NullOr(WeightUnitSchema)),
  heightUnit: S.optional(S.NullOr(HeightUnitSchema)),
});

export type SavePhysicalInfoPayload = S.Schema.Type<typeof SavePhysicalInfoSchema>;
