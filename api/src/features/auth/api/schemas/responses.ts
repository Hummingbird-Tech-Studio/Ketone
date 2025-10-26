import { Schema as S } from 'effect';

/**
 * Response Schemas
 * Schemas for API responses
 */

export class UserResponseSchema extends S.Class<UserResponseSchema>('UserResponseSchema')({
  id: S.String,
  email: S.String,
  createdAt: S.Date,
  updatedAt: S.Date,
}) {}

export class SignupResponseSchema extends S.Class<SignupResponseSchema>('SignupResponseSchema')({
  user: UserResponseSchema,
}) {}
