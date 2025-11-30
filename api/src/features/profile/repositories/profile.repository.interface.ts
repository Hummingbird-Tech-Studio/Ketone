import { Effect } from 'effect';
import { ProfileRepositoryError } from './errors';
import type { ProfileRecord } from './schemas';

export interface IProfileRepository {
  /**
   * Upsert a profile for a user.
   * Creates a new profile if one doesn't exist, or updates the existing one.
   *
   * @param userId - The ID of the user
   * @param data - The profile data to upsert
   * @returns Effect that resolves to the created/updated ProfileRecord
   */
  upsertProfile(
    userId: string,
    data: { name?: string | null; dateOfBirth?: string | null },
  ): Effect.Effect<ProfileRecord, ProfileRepositoryError>;
}
