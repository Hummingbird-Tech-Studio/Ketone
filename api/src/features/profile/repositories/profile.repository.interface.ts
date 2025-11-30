import { Effect } from 'effect';
import { ProfileRepositoryError } from './errors';
import type { ProfileRecord } from './schemas';

export interface IProfileRepository {
  /**
   * Get a profile for a user.
   *
   * @param userId - The ID of the user
   * @returns Effect that resolves to the ProfileRecord or null if not found
   */
  getProfile(userId: string): Effect.Effect<ProfileRecord | null, ProfileRepositoryError>;

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
