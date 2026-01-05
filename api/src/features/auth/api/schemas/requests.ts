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
    S.minLength(1, { message: () => 'Invalid email or password' }),
    S.maxLength(100, { message: () => 'Invalid email or password' }),
  ),
}) {}

/**
 * Forgot Password Request Schema
 * Request to initiate password reset
 */
export class ForgotPasswordRequestSchema extends S.Class<ForgotPasswordRequestSchema>('ForgotPasswordRequestSchema')({
  email: EmailSchema,
}) {}

/**
 * Reset Password Request Schema
 * Request to reset password with token
 */
export class ResetPasswordRequestSchema extends S.Class<ResetPasswordRequestSchema>('ResetPasswordRequestSchema')({
  token: S.String.pipe(
    S.minLength(1, { message: () => 'Token is required' }),
    S.maxLength(44, { message: () => 'Token exceeds maximum length' }),
  ),
  password: PasswordSchema,
}) {}
