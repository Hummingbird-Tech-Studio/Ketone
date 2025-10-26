import { HttpApi, HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import {
  PasswordHashErrorSchema,
  SignupRequestSchema,
  SignupResponseSchema,
  UserAlreadyExistsErrorSchema,
  UserRepositoryErrorSchema,
} from './schemas';

/**
 * Auth API Contract definition
 */

export class AuthApiGroup extends HttpApiGroup.make('auth')
  .add(
    // POST /auth/signup - Create new user account
    HttpApiEndpoint.post('signup', '/auth/signup')
      .setPayload(SignupRequestSchema)
      .addSuccess(SignupResponseSchema)
      .addError(UserAlreadyExistsErrorSchema)
      .addError(UserRepositoryErrorSchema)
      .addError(PasswordHashErrorSchema),
  ) {}

export class AuthApi extends HttpApi.make('auth-api').add(AuthApiGroup) {}
