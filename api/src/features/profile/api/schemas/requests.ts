import { Schema as S } from 'effect';

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
