import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import {
  InvalidCredentialsErrorSchema,
  JwtGenerationErrorSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  PasswordHashErrorSchema,
  SignupRequestSchema,
  SignupResponseSchema,
  UpdatePasswordRequestSchema,
  UpdatePasswordResponseSchema,
  UserAlreadyExistsErrorSchema,
  UserAuthClientErrorSchema,
  UserRepositoryErrorSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from './middleware';

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
      .addError(UserRepositoryErrorSchema, { status: 500 })
      .addError(PasswordHashErrorSchema, { status: 500 }),
  )
  .add(
    // POST /auth/login - Authenticate user and generate JWT token
    HttpApiEndpoint.post('login', '/auth/login')
      .setPayload(LoginRequestSchema)
      .addSuccess(LoginResponseSchema)
      .addError(InvalidCredentialsErrorSchema, { status: 401 })
      .addError(UserRepositoryErrorSchema, { status: 500 })
      .addError(PasswordHashErrorSchema, { status: 500 })
      .addError(JwtGenerationErrorSchema, { status: 500 }),
  )
  .add(
    // POST /auth/update-password - Update user password (requires authentication)
    HttpApiEndpoint.post('updatePassword', '/auth/update-password')
      .setPayload(UpdatePasswordRequestSchema)
      .addSuccess(UpdatePasswordResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(InvalidCredentialsErrorSchema, { status: 401 })
      .addError(UserRepositoryErrorSchema, { status: 500 })
      .addError(PasswordHashErrorSchema, { status: 500 })
      .addError(UserAuthClientErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
