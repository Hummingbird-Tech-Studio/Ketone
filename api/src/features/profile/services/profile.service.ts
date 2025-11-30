import { Effect } from 'effect';
import { ProfileRepository, type ProfileRecord, ProfileRepositoryError } from '../repositories';

export class ProfileService extends Effect.Service<ProfileService>()('ProfileService', {
  effect: Effect.gen(function* () {
    const repository = yield* ProfileRepository;

    return {
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
    };
  }),
  dependencies: [ProfileRepository.Default],
  accessors: true,
}) {}
