import { Schema as S } from 'effect';

/**
 * Reusable password schema for new/updated passwords
 */
export const PasswordSchema = S.String.pipe(
  S.minLength(8, { message: () => 'Password must be at least 8 characters' }),
  S.maxLength(100, { message: () => 'Password must be at most 100 characters long' }),
  S.filter((password) => /[a-z]/.test(password), {
    message: () => 'Password must contain at least 1 lowercase letter',
  }),
  S.filter((password) => /[A-Z]/.test(password), {
    message: () => 'Password must contain at least 1 uppercase letter',
  }),
  S.filter((password) => /\d/.test(password), {
    message: () => 'Password must contain at least 1 number',
  }),
  S.filter((password) => /[^A-Za-z0-9\s]/.test(password), {
    message: () => 'Password must contain at least 1 special character (e.g., %, &, $, !, @)',
  }),
  S.filter((password) => /^\S*$/.test(password), {
    message: () => 'Password cannot contain leading or trailing whitespace',
  }),
);
