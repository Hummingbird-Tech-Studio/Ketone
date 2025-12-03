import { Schema as S } from 'effect';
import { EmailSchema, PasswordSchema } from '@ketone/shared';

/**
 * Password confirmation schema for operations that require password verification.
 * Unlike PasswordSchema, this doesn't validate complexity - it only verifies the password exists.
 */
const PasswordConfirmationSchema = S.String.pipe(
  S.minLength(1, { message: () => 'Password is required' }),
  S.maxLength(100, { message: () => 'Password must be at most 100 characters long' }),
  S.filter((p) => p.trim().length > 0, { message: () => 'Password cannot be blank' }),
);

/**
 * Update Email Request Schema
 * Requires the new email and current password for verification
 */
export class UpdateEmailRequestSchema extends S.Class<UpdateEmailRequestSchema>('UpdateEmailRequestSchema')({
  email: EmailSchema,
  password: PasswordConfirmationSchema,
}) {}

/**
 * Update Password Request Schema
 * Requires current password for verification and new password with full validation
 */
const UpdatePasswordFields = S.Struct({
  currentPassword: PasswordConfirmationSchema,
  newPassword: PasswordSchema,
});

export class UpdatePasswordRequestSchema extends S.Class<UpdatePasswordRequestSchema>('UpdatePasswordRequestSchema')(
  UpdatePasswordFields.pipe(
    S.filter((data) => data.newPassword !== data.currentPassword, {
      message: () => 'New password must be different from current password',
    }),
  ),
) {}
