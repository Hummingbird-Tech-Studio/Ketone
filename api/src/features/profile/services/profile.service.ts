import { Effect } from 'effect';
import {
  ProfileRepository,
  type ProfileRecord,
  ProfileRepositoryError,
  type Gender,
  type WeightUnit,
  type HeightUnit,
} from '../repositories';

export class ProfileService extends Effect.Service<ProfileService>()('ProfileService', {
  effect: Effect.gen(function* () {
    const repository = yield* ProfileRepository;

    return {
      /**
       * Get a user's profile.
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves to the ProfileRecord or null if not found
       */
      getProfile: (userId: string): Effect.Effect<ProfileRecord | null, ProfileRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[ProfileService] Getting profile for user ${userId}`);

          const profile = yield* repository.getProfile(userId);

          if (profile) {
            yield* Effect.logInfo(`[ProfileService] Profile found for user ${userId}`);
          } else {
            yield* Effect.logInfo(`[ProfileService] No profile found for user ${userId}`);
          }

          return profile;
        }),

      /**
       * Save (create or update) a user's profile.
       *
       * @param userId - The ID of the user
       * @param data - The profile data to save
       * @returns Effect that resolves to the saved ProfileRecord
       */
      saveProfile: (
        userId: string,
        data: { name?: string | null; dateOfBirth?: string | null },
      ): Effect.Effect<ProfileRecord, ProfileRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[ProfileService] Saving profile for user ${userId}`);

          const profile = yield* repository.upsertProfile(userId, data);

          yield* Effect.logInfo(`[ProfileService] Profile saved successfully for user ${userId}`);
          return profile;
        }),

      /**
       * Get physical information from a user's profile.
       *
       * @param userId - The ID of the user
       * @returns Effect that resolves to the ProfileRecord or null if not found
       */
      getPhysicalInfo: (userId: string): Effect.Effect<ProfileRecord | null, ProfileRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[ProfileService] Getting physical info for user ${userId}`);

          const profile = yield* repository.getProfile(userId);

          if (profile) {
            yield* Effect.logInfo(`[ProfileService] Physical info found for user ${userId}`);
          } else {
            yield* Effect.logInfo(`[ProfileService] No profile found for user ${userId}`);
          }

          return profile;
        }),

      /**
       * Save (create or update) physical information for a user's profile.
       *
       * @param userId - The ID of the user
       * @param data - The physical info data to save
       * @returns Effect that resolves to the saved ProfileRecord
       */
      savePhysicalInfo: (
        userId: string,
        data: {
          weight?: number | null;
          height?: number | null;
          gender?: Gender | null;
          weightUnit?: WeightUnit | null;
          heightUnit?: HeightUnit | null;
        },
      ): Effect.Effect<ProfileRecord, ProfileRepositoryError> =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[ProfileService] Saving physical info for user ${userId}`);

          const profile = yield* repository.upsertPhysicalInfo(userId, data);

          yield* Effect.logInfo(`[ProfileService] Physical info saved successfully for user ${userId}`);
          return profile;
        }),
    };
  }),
  dependencies: [ProfileRepository.Default],
  accessors: true,
}) {}
