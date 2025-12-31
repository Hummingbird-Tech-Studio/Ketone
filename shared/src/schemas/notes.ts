import { Schema as S } from 'effect';

export const NOTES_MAX_LENGTH = 1000;

/**
 * Reusable notes validation schema
 * - Max 1000 characters
 * - Trims whitespace
 */
export const NotesSchema = S.String.pipe(
  S.maxLength(NOTES_MAX_LENGTH, { message: () => `Notes must be at most ${NOTES_MAX_LENGTH} characters` }),
  S.transform(S.String, {
    decode: (s) => s.trim(),
    encode: (s) => s,
  }),
);
