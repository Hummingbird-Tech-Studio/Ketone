import { HttpApiBuilder } from '@effect/platform';
import { Effect, Option } from 'effect';
import { Api } from '../../../api';
import { ProfileService, type ProfileRecord } from '../services';
import { ProfileRepositoryErrorSchema } from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

/**
 * Convert ProfileRecord to API response format
 * Transforms Date objects to ISO date strings (YYYY-MM-DD)
 */
const toProfileResponse = (profile: ProfileRecord) => ({
  id: profile.id,
  userId: profile.userId,
  name: profile.name,
  dateOfBirth: Option.fromNullable(profile.dateOfBirth).pipe(
    Option.map((date) => date.toISOString().split('T')[0]!),
    Option.getOrNull,
  ),
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

export const ProfileApiLive = HttpApiBuilder.group(Api, 'profile', (handlers) =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;

    return handlers
      .handle('getProfile', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] GET /api/v1/profile - Request received for user ${userId}`);

          const profile = yield* profileService.getProfile(userId).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error getting profile: ${error.message}`)),
            Effect.catchTags({
              ProfileRepositoryError: (error) =>
                Effect.fail(
                  new ProfileRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          if (!profile) {
            yield* Effect.logInfo(`[Handler] No profile found for user ${userId}`);
            return null;
          }

          yield* Effect.logInfo(`[Handler] Profile retrieved successfully for user ${userId}`);
          return toProfileResponse(profile);
        }),
      )
      .handle('saveProfile', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] PUT /api/v1/profile - Request received for user ${userId}`);

          const profile = yield* profileService.saveProfile(userId, payload).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error saving profile: ${error.message}`)),
            Effect.catchTags({
              ProfileRepositoryError: (error) =>
                Effect.fail(
                  new ProfileRepositoryErrorSchema({
                    message: error.message,
                    cause: error.cause,
                  }),
                ),
            }),
          );

          yield* Effect.logInfo(`[Handler] Profile saved successfully for user ${userId}`);
          return toProfileResponse(profile);
        }),
      );
  }),
);
