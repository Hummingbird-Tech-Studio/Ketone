import { Schema as S } from 'effect';

/**
 * Reusable email validation schema
 */
export const EmailSchema = S.String.pipe(
  S.maxLength(255, { message: () => 'Email must be at most 255 characters long' }),
  S.filter(
    (email) => {
      const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
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
);
