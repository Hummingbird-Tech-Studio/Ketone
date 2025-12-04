import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema } from 'effect';
import {
  UpdateEmailRequestSchema,
  UpdateEmailResponseSchema,
  UpdatePasswordRequestSchema,
  UpdatePasswordResponseSchema,
  DeleteAccountRequestSchema,
  InvalidPasswordErrorSchema,
  TooManyRequestsErrorSchema,
  SameEmailErrorSchema,
  EmailAlreadyInUseErrorSchema,
  UserAccountServiceErrorSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class UserAccountApiGroup extends HttpApiGroup.make('user-account')
  .add(
    HttpApiEndpoint.put('updateEmail', '/v1/account/email')
      .setPayload(UpdateEmailRequestSchema)
      .addSuccess(UpdateEmailResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(TooManyRequestsErrorSchema, { status: 429 })
      .addError(InvalidPasswordErrorSchema, { status: 403 })
      .addError(SameEmailErrorSchema, { status: 400 })
      .addError(EmailAlreadyInUseErrorSchema, { status: 409 })
      .addError(UserAccountServiceErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.put('updatePassword', '/v1/account/password')
      .setPayload(UpdatePasswordRequestSchema)
      .addSuccess(UpdatePasswordResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(TooManyRequestsErrorSchema, { status: 429 })
      .addError(InvalidPasswordErrorSchema, { status: 403 })
      .addError(UserAccountServiceErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.del('deleteAccount', '/v1/account')
      .setPayload(DeleteAccountRequestSchema)
      .addSuccess(Schema.Void, { status: 204 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(TooManyRequestsErrorSchema, { status: 429 })
      .addError(InvalidPasswordErrorSchema, { status: 403 })
      .addError(UserAccountServiceErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
