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

          yield* Effect.logInfo('GET /api/v1/profile - Request received');

          const profile = yield* profileService.getProfile(userId).pipe(
            Effect.tapError(() => Effect.logError('Error getting profile')),
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
            yield* Effect.logInfo('No profile found');
            return null;
          }

          yield* Effect.logInfo('Profile retrieved successfully');
          return toProfileResponse(profile);
        }).pipe(Effect.annotateLogs({ handler: 'profile.getProfile' })),
      )
      .handle('saveProfile', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('PUT /api/v1/profile - Request received');

          const profile = yield* profileService.saveProfile(userId, payload).pipe(
            Effect.tapError(() => Effect.logError('Error saving profile')),
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

          yield* Effect.logInfo('Profile saved successfully');
          return toProfileResponse(profile);
        }).pipe(Effect.annotateLogs({ handler: 'profile.saveProfile' })),
      )
      .handle('getPhysicalInfo', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('GET /api/v1/profile/physical - Request received');

          const profile = yield* profileService.getPhysicalInfo(userId).pipe(
            Effect.tapError(() => Effect.logError('Error getting physical info')),
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
            yield* Effect.logInfo('No physical info found');
            return null;
          }

          yield* Effect.logInfo('Physical info retrieved successfully');
          return toPhysicalInfoResponse(profile);
        }).pipe(Effect.annotateLogs({ handler: 'profile.getPhysicalInfo' })),
      )
      .handle('savePhysicalInfo', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('PUT /api/v1/profile/physical - Request received');

          const profile = yield* profileService.savePhysicalInfo(userId, payload).pipe(
            Effect.tapError(() => Effect.logError('Error saving physical info')),
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

          yield* Effect.logInfo('Physical info saved successfully');
          return toPhysicalInfoResponse(profile);
        }).pipe(Effect.annotateLogs({ handler: 'profile.savePhysicalInfo' })),
      );
  }),
);
