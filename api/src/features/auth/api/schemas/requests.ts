import { Schema as S } from 'effect';
import { EmailSchema, PasswordSchema } from '@ketone/shared';

/**
 * Request Schemas
 * Validation schemas for incoming API requests
 */

const SignupFields = S.Struct({
  email: EmailSchema,
  password: PasswordSchema,
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
