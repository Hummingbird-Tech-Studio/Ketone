import { Schema as S } from 'effect';

/**
 * Request Schemas
 * Validation schemas for incoming API requests
 */

const SignupFields = S.Struct({
  email: S.String.pipe(
    S.maxLength(255, { message: () => 'Email must be at most 255 characters long' }),
    S.filter(
      (email) => {
        // Strict email validation regex
        const emailRegex =
          /^[a-z0-9.!#$&'*+/=?^_`{|}~\-]+@[a-z0-9](?:[a-z0-9-]{0,62}(?<!-))?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}(?<!-))?)+$/i;
        return emailRegex.test(email);
      },
      { message: () => 'Invalid email format' },
    ),
    S.filter((email) => !email.includes('..'), {
      message: () => 'Email cannot contain consecutive dots',
    }),
    S.filter((email) => !email.includes('.@'), {
      message: () => 'Email cannot have a dot immediately before @',
    }),
    S.filter((email) => !email.startsWith('.'), {
      message: () => 'Email cannot start with a dot',
    }),
  ),
  password: S.String.pipe(
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
      message: () => 'Password cannot contain any whitespace',
    }),
  ),
});

export class SignupRequestSchema extends S.Class<SignupRequestSchema>('SignupRequestSchema')(
  SignupFields.pipe(
    S.filter((data) => data.password !== data.email, { message: () => 'Password cannot be the same as email' }),
  ),
) {}
