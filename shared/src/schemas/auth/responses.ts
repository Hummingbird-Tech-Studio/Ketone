import { Schema as S } from 'effect';

/**
 * Auth Response Schemas
 * Shared schemas for authentication API responses
 */

/**
 * User Response Schema
 */
export class UserResponseSchema extends S.Class<UserResponseSchema>('UserResponseSchema')({
  id: S.UUID,
  email: S.String,
  createdAt: S.String,
  updatedAt: S.String,
}) {}

/**
 * Signup Response Schema
 * Response from POST /auth/signup
 */
export class SignupResponseSchema extends S.Class<SignupResponseSchema>('SignupResponseSchema')({
  token: S.String.pipe(S.minLength(1)),
  user: UserResponseSchema,
}) {}

/**
 * Login Response Schema
 * Response from POST /auth/login
 */
export class LoginResponseSchema extends S.Class<LoginResponseSchema>('LoginResponseSchema')({
  token: S.String.pipe(S.minLength(1)),
  user: UserResponseSchema,
}) {}

/**
 * Update Password Response Schema
 * Response from PUT /v1/account/password
 */
export class UpdatePasswordResponseSchema extends S.Class<UpdatePasswordResponseSchema>('UpdatePasswordResponseSchema')({
  message: S.String,
}) {}
