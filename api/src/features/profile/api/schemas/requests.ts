import { Schema as S } from 'effect';

export const SaveProfileSchema = S.Struct({
  name: S.optional(S.NullOr(S.String)),
  dateOfBirth: S.optional(S.NullOr(S.String)),
});

export type SaveProfilePayload = S.Schema.Type<typeof SaveProfileSchema>;
