import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { usersTable } from '../../../db';
import { UserAlreadyExistsError } from '../domain';
import { UserRepositoryError } from './errors';

/**
 * User Repository Service
 * Handles database operations for users
 */

const UNIQUE_CONSTRAINT_VIOLATION_CODE = '23505';

export class UserRepository extends Effect.Service<UserRepository>()('UserRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      createUser: (email: string, passwordHash: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Creating user`);
          const canonicalEmail = email.trim().toLowerCase();

          const results = yield* drizzle
            .insert(usersTable)
            .values({
              email: canonicalEmail,
              passwordHash,
            })
            .returning({
              id: usersTable.id,
              email: usersTable.email,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
            })
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in createUser', error)),
              Effect.mapError((error) => {
                // Check for PostgreSQL unique constraint violation (error code 23505)
                if (
                  typeof error === 'object' &&
                  error !== null &&
                  'code' in error &&
                  error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
                ) {
                  return new UserAlreadyExistsError({
                    message: 'User with this email already exists',
                    email: canonicalEmail,
                  });
                }

                return new UserRepositoryError({
                  message: 'Failed to create user in database',
                  cause: error,
                });
              }),
            );

          const result = results[0];

          if (!result) {
            return yield* Effect.fail(
              new UserRepositoryError({
                message: 'Failed to create user: no result returned',
              }),
            );
          }

          yield* Effect.logInfo(`[UserRepository] User created successfully with id: ${result.id}`);

          return result;
        }),
      findUserByEmail: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Finding user by email`);
          const canonicalEmail = email.trim().toLowerCase();

          const results = yield* drizzle
            .select({
              id: usersTable.id,
              email: usersTable.email,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
            })
            .from(usersTable)
            .where(eq(usersTable.email, canonicalEmail))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in findUserByEmail', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to find user by email',
                    cause: error,
                  }),
              ),
            );

          const result = results[0] || null;

          if (result) {
            yield* Effect.logInfo(`[UserRepository] User found with id: ${result.id}`);
          } else {
            yield* Effect.logInfo(`[UserRepository] User not found`);
          }

          return result;
        }),
      findUserByEmailWithPassword: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Finding user by email`);
          const canonicalEmail = email.trim().toLowerCase();

          const results = yield* drizzle
            .select({
              id: usersTable.id,
              email: usersTable.email,
              passwordHash: usersTable.passwordHash,
              passwordChangedAt: usersTable.passwordChangedAt,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
            })
            .from(usersTable)
            .where(eq(usersTable.email, canonicalEmail))
            .limit(1)
            .pipe(
              Effect.tapError((error) =>
                Effect.logError('❌ Database error in findUserByEmail (auth lookup)', error),
              ),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to find user by email (auth lookup)',
                    cause: error,
                  }),
              ),
            );

          const result = results[0] || null;

          if (result) {
            yield* Effect.logInfo(`[UserRepository] User found with id: ${result.id}`);
          } else {
            yield* Effect.logInfo(`[UserRepository] User not found`);
          }

          return result;
        }),
      findUserByIdWithPassword: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Finding user by ID`);

          const results = yield* drizzle
            .select({
              id: usersTable.id,
              email: usersTable.email,
              passwordHash: usersTable.passwordHash,
              passwordChangedAt: usersTable.passwordChangedAt,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
            })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1)
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in findUserById', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to find user by ID',
                    cause: error,
                  }),
              ),
            );

          const result = results[0] || null;

          if (result) {
            yield* Effect.logInfo(`[UserRepository] User found`);
          } else {
            yield* Effect.logInfo(`[UserRepository] User not found`);
          }

          return result;
        }),
      updateUserPassword: (userId: string, newPasswordHash: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Updating password for user ${userId}`);

          const now = new Date();
          const results = yield* drizzle
            .update(usersTable)
            .set({
              passwordHash: newPasswordHash,
              passwordChangedAt: now, // Set timestamp to invalidate existing tokens
              updatedAt: now,
            })
            .where(eq(usersTable.id, userId))
            .returning({
              id: usersTable.id,
              email: usersTable.email,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
              passwordChangedAt: usersTable.passwordChangedAt,
            })
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in updateUserPassword', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to update user password',
                    cause: error,
                  }),
              ),
            );

          const result = results[0];

          if (!result) {
            return yield* Effect.fail(
              new UserRepositoryError({
                message: 'Failed to update password: no result returned',
              }),
            );
          }

          yield* Effect.logInfo(`[UserRepository] Password updated successfully for user ${userId}`);

          return result;
        }),
      deleteUserByEmail: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Deleting user by email`);
          const canonicalEmail = email.trim().toLowerCase();

          yield* drizzle
            .delete(usersTable)
            .where(eq(usersTable.email, canonicalEmail))
            .pipe(
              Effect.tapError((error) => Effect.logError('❌ Database error in deleteUserByEmail', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to delete user by email',
                    cause: error,
                  }),
              ),
            );

          yield* Effect.logInfo(`[UserRepository] User deleted successfully`);
        }),
    };
  }),
  accessors: true,
}) {}
