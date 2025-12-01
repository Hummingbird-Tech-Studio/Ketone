import { HttpApiBuilder } from '@effect/platform';
import { Effect, Option } from 'effect';
import { Api } from '../../../api';
import { ProfileService, type ProfileRecord } from '../services';
import { ProfileRepositoryErrorSchema } from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

/**
 * Calculate age from date of birth
 */
const calculateAge = (dateOfBirth: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
};

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

/**
 * Convert ProfileRecord to PhysicalInfo response format
 * Includes calculated age from dateOfBirth
 */
const toPhysicalInfoResponse = (profile: ProfileRecord) => ({
  weight: profile.weight,
  height: profile.height,
  gender: profile.gender,
  weightUnit: profile.weightUnit,
  heightUnit: profile.heightUnit,
  age: Option.fromNullable(profile.dateOfBirth).pipe(Option.map(calculateAge), Option.getOrNull),
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
      )
      .handle('getPhysicalInfo', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] GET /api/v1/profile/physical - Request received for user ${userId}`);

          const profile = yield* profileService.getPhysicalInfo(userId).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error getting physical info: ${error.message}`)),
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
            yield* Effect.logInfo(`[Handler] No physical info found for user ${userId}`);
            return null;
          }

          yield* Effect.logInfo(`[Handler] Physical info retrieved successfully for user ${userId}`);
          return toPhysicalInfoResponse(profile);
        }),
      )
      .handle('savePhysicalInfo', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`[Handler] PUT /api/v1/profile/physical - Request received for user ${userId}`);

          const profile = yield* profileService.savePhysicalInfo(userId, payload).pipe(
            Effect.tapError((error) => Effect.logError(`[Handler] Error saving physical info: ${error.message}`)),
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

          yield* Effect.logInfo(`[Handler] Physical info saved successfully for user ${userId}`);
          return toPhysicalInfoResponse(profile);
        }),
      );
  }),
);
