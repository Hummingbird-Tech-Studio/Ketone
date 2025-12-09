import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  PasswordHashErrorSchema,
  SignupRequestSchema,
  SignupResponseSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  PasswordResetTokenInvalidErrorSchema,
  LoginRateLimitErrorSchema,
  SignupRateLimitErrorSchema,
  PasswordResetRateLimitErrorSchema,
} from './schemas';

/**
 * Auth API Contract definition
 */

export class AuthApiGroup extends HttpApiGroup.make('auth')
  .add(
    // POST /auth/signup - Create new user account
    HttpApiEndpoint.post('signup', '/auth/signup')
      .setPayload(SignupRequestSchema)
      .addSuccess(SignupResponseSchema, { status: 201 })
      .addError(UserAlreadyExistsErrorSchema, { status: 409 })
      .addError(SignupRateLimitErrorSchema, { status: 429 })
      .addError(UserRepositoryErrorSchema, { status: 500 })
      .addError(PasswordHashErrorSchema, { status: 500 })
      .addError(JwtGenerationErrorSchema, { status: 500 }),
  )
  .add(
    // POST /auth/login - Authenticate user and generate JWT token
    HttpApiEndpoint.post('login', '/auth/login')
      .setPayload(LoginRequestSchema)
      .addSuccess(LoginResponseSchema)
      .addError(InvalidCredentialsErrorSchema, { status: 401 })
      .addError(LoginRateLimitErrorSchema, { status: 429 })
      .addError(UserRepositoryErrorSchema, { status: 500 })
      .addError(PasswordHashErrorSchema, { status: 500 })
      .addError(JwtGenerationErrorSchema, { status: 500 }),
  )
  .add(
    // POST /auth/forgot-password - Request password reset
    HttpApiEndpoint.post('forgotPassword', '/auth/forgot-password')
      .setPayload(ForgotPasswordRequestSchema)
      .addSuccess(ForgotPasswordResponseSchema)
      .addError(UserRepositoryErrorSchema, { status: 500 }),
  )
  .add(
    // POST /auth/reset-password - Reset password with token
    HttpApiEndpoint.post('resetPassword', '/auth/reset-password')
      .setPayload(ResetPasswordRequestSchema)
      .addSuccess(ResetPasswordResponseSchema)
      .addError(PasswordResetTokenInvalidErrorSchema, { status: 400 })
      .addError(PasswordResetRateLimitErrorSchema, { status: 429 })
      .addError(PasswordHashErrorSchema, { status: 500 })
      .addError(UserRepositoryErrorSchema, { status: 500 }),
  ) {}
