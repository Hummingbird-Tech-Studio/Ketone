import { Schema as S } from 'effect';
import { EmailSchema } from '../../domain';

/**
 * Request Schemas
 * Validation schemas for incoming API requests
 */

const SignupFields = S.Struct({
  email: EmailSchema,
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

/**
 * Login Request Schema
 * Uses same email validation as signup for consistency
 */
export class LoginRequestSchema extends S.Class<LoginRequestSchema>('LoginRequestSchema')({
  email: EmailSchema,
  password: S.String.pipe(
    S.minLength(1, { message: () => 'Password is required' }),
    S.maxLength(100, { message: () => 'Password must be at most 100 characters long' }),
    S.filter((p) => p.trim().length > 0, { message: () => 'Password cannot be blank' }),
  ),
}) {}
