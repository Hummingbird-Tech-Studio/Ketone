import { HttpApiBuilder } from '@effect/platform';
import { Effect, Option } from 'effect';
import { Api } from '../../../api';
import { ProfileService } from '../services';
import { ProfileRepositoryErrorSchema } from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

export const ProfileApiLive = HttpApiBuilder.group(Api, 'profile', (handlers) =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;

    return handlers.handle('saveProfile', ({ payload }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;

        yield* Effect.logInfo(`[Handler] PUT /api/v1/profile - Request received for user ${userId}`);
        yield* Effect.logInfo(`[Handler] Payload:`, payload);

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

        // Convert Date to string (YYYY-MM-DD) for API response
        const dateOfBirthString = Option.fromNullable(profile.dateOfBirth).pipe(
          Option.map((date) => date.toISOString().split('T')[0]!),
          Option.getOrNull,
        );

        return {
          id: profile.id,
          userId: profile.userId,
          name: profile.name,
          dateOfBirth: dateOfBirthString,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        };
      }),
    );
  }),
);
