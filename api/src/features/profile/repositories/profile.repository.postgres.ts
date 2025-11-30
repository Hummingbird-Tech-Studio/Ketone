import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Schema as S } from 'effect';
import { profilesTable } from '../../../db';
import { ProfileRepositoryError } from './errors';
import { ProfileRecordSchema } from './schemas';
import type { IProfileRepository } from './profile.repository.interface';

export class ProfileRepositoryPostgres extends Effect.Service<ProfileRepositoryPostgres>()('ProfileRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    const repository: IProfileRepository = {
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
    };

    return repository;
  }),
  accessors: true,
}) {}
