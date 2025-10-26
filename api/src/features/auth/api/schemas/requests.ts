import { Schema as S } from 'effect';

/**
 * Request Schemas
 * Validation schemas for incoming API requests
 */

export class SignupRequestSchema extends S.Class<SignupRequestSchema>('SignupRequestSchema')({
  email: S.String.pipe(
    S.filter((email) => {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }, { message: () => 'Invalid email format' }),
  ),
  password: S.String.pipe(
    S.minLength(8, { message: () => 'Password must be at least 8 characters long' }),
    S.maxLength(100, { message: () => 'Password must be at most 100 characters long' }),
  ),
}) {}
