import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { SaveProfileSchema, ProfileRepositoryErrorSchema, ProfileResponseSchema } from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class ProfileApiGroup extends HttpApiGroup.make('profile').add(
  HttpApiEndpoint.put('saveProfile', '/v1/profile')
    .setPayload(SaveProfileSchema)
    .addSuccess(ProfileResponseSchema)
    .addError(UnauthorizedErrorSchema, { status: 401 })
    .addError(ProfileRepositoryErrorSchema, { status: 500 })
    .middleware(Authentication),
) {}
