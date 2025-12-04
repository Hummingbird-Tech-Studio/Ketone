import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Schema as S } from 'effect';
import { eq } from 'drizzle-orm';
import { profilesTable } from '../../../db';
import { ProfileRepositoryError } from './errors';
import { ProfileRecordSchema, type Gender, type HeightUnit, type WeightUnit } from './schemas';
import type { IProfileRepository } from './profile.repository.interface';

export class ProfileRepositoryPostgres extends Effect.Service<ProfileRepositoryPostgres>()('ProfileRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    const repository: IProfileRepository = {
      getProfile: (userId: string) =>
        Effect.gen(function* () {
          const results = yield* drizzle
            .select()
            .from(profilesTable)
            .where(eq(profilesTable.userId, userId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in getProfile', error)),
              Effect.mapError((error) => {
                return new ProfileRepositoryError({
                  message: 'Failed to get profile from database',
                  cause: error,
                });
              }),
            );

          if (results.length === 0) {
            return null;
          }

          return yield* S.decodeUnknown(ProfileRecordSchema)(results[0]).pipe(
            Effect.mapError(
              (error) =>
                new ProfileRepositoryError({
                  message: 'Failed to validate profile record from database',
                  cause: error,
                }),
            ),
          );
        }),

      upsertProfile: (userId: string, data: { name?: string | null; dateOfBirth?: string | null }) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .insert(profilesTable)
            .values({
              userId,
              name: data.name ?? null,
              dateOfBirth: data.dateOfBirth ?? null,
            })
            .onConflictDoUpdate({
              target: profilesTable.userId,
              set: {
                name: data.name ?? null,
                dateOfBirth: data.dateOfBirth ?? null,
                updatedAt: new Date(),
              },
            })
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in upsertProfile', error)),
              Effect.mapError((error) => {
                return new ProfileRepositoryError({
                  message: 'Failed to upsert profile in database',
                  cause: error,
                });
              }),
            );

          return yield* S.decodeUnknown(ProfileRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new ProfileRepositoryError({
                  message: 'Failed to validate profile record from database',
                  cause: error,
                }),
            ),
          );
        }),

      upsertPhysicalInfo: (
        userId: string,
        data: {
          weight?: number | null;
          height?: number | null;
          gender?: Gender | null;
          weightUnit?: WeightUnit | null;
          heightUnit?: HeightUnit | null;
        },
      ) =>
        Effect.gen(function* () {
          const [result] = yield* drizzle
            .insert(profilesTable)
            .values({
              userId,
              weight: data.weight?.toString() ?? null,
              height: data.height?.toString() ?? null,
              gender: data.gender ?? null,
              weightUnit: data.weightUnit ?? null,
              heightUnit: data.heightUnit ?? null,
            })
            .onConflictDoUpdate({
              target: profilesTable.userId,
              set: {
                weight: data.weight?.toString() ?? null,
                height: data.height?.toString() ?? null,
                gender: data.gender ?? null,
                weightUnit: data.weightUnit ?? null,
                heightUnit: data.heightUnit ?? null,
                updatedAt: new Date(),
              },
            })
            .returning()
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in upsertPhysicalInfo', error)),
              Effect.mapError((error) => {
                return new ProfileRepositoryError({
                  message: 'Failed to upsert physical info in database',
                  cause: error,
                });
              }),
            );

          return yield* S.decodeUnknown(ProfileRecordSchema)(result).pipe(
            Effect.mapError(
              (error) =>
                new ProfileRepositoryError({
                  message: 'Failed to validate profile record from database',
                  cause: error,
                }),
            ),
          );
        }),

      deleteByUserId: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[ProfileRepository] Deleting profile for user ${userId}`);
          yield* drizzle
            .delete(profilesTable)
            .where(eq(profilesTable.userId, userId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteByUserId', error)),
              Effect.mapError((error) => {
                return new ProfileRepositoryError({
                  message: 'Failed to delete profile from database',
                  cause: error,
                });
              }),
            );
        }),
    };

    return repository;
  }),
  accessors: true,
}) {}
