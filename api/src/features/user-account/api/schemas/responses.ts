import { Schema as S } from 'effect';

/**
 * Update Email Response Schema
 * Returns the updated user information
 */
export class UpdateEmailResponseSchema extends S.Class<UpdateEmailResponseSchema>('UpdateEmailResponseSchema')({
  id: S.UUID,
  email: S.String,
}) {}

/**
 * Update Password Response Schema
 * Returns a success message
 */
export class UpdatePasswordResponseSchema extends S.Class<UpdatePasswordResponseSchema>('UpdatePasswordResponseSchema')({
  message: S.String,
}) {}
