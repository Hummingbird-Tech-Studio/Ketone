import { Effect } from 'effect';
import { ProfileRepositoryError } from './errors';
import type { Gender, HeightUnit, ProfileRecord, WeightUnit } from './schemas';

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

  /**
   * Upsert physical information for a user's profile.
   * Creates a new profile if one doesn't exist, or updates the existing one.
   *
   * @param userId - The ID of the user
   * @param data - The physical info data to upsert
   * @returns Effect that resolves to the created/updated ProfileRecord
   */
  upsertPhysicalInfo(
    userId: string,
    data: {
      weight?: number | null;
      height?: number | null;
      gender?: Gender | null;
      weightUnit?: WeightUnit | null;
      heightUnit?: HeightUnit | null;
    },
  ): Effect.Effect<ProfileRecord, ProfileRepositoryError>;

  /**
   * Delete a profile for a user.
   *
   * Used for account deletion to remove all user data.
   *
   * @param userId - The ID of the user whose profile to delete
   * @returns Effect that resolves to void on successful deletion
   */
  deleteByUserId(userId: string): Effect.Effect<void, ProfileRepositoryError>;
}
