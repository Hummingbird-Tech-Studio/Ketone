import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect } from 'effect';
import { eq, sql } from 'drizzle-orm';
import { usersTable } from '../../../db';
import { UserAlreadyExistsError } from '../domain';
import { UserRepositoryError } from './errors';

const UNIQUE_CONSTRAINT_VIOLATION_CODE = '23505';

/**
 * Extracts the PostgreSQL error from @effect/sql-drizzle wrapped errors.
 * Error structure: SqlError { cause: { query, params, cause: pgError } }
 * The actual PostgreSQL error with `code` is at error.cause.cause
 */
const extractPgError = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null) return null;
  if (!('cause' in error)) return null;

  const outerCause = error.cause;

  if (typeof outerCause !== 'object' || outerCause === null) return null;
  if (!('cause' in outerCause)) return null;

  return outerCause.cause;
};

/**
 * Checks if an error is a PostgreSQL unique constraint violation (code 23505)
 */
const isUniqueConstraintViolation = (error: unknown): boolean => {
  const pgError = extractPgError(error);
  return (
    typeof pgError === 'object' &&
    pgError !== null &&
    'code' in pgError &&
    pgError.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
  );
};

export class UserRepository extends Effect.Service<UserRepository>()('UserRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      createUser: (email: string, passwordHash: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Creating user');
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
              Effect.tapError((error) => Effect.logError('Database error in createUser', error)),
              Effect.mapError((error) => {
                if (isUniqueConstraintViolation(error)) {
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

          yield* Effect.logInfo(`User created successfully with id: ${result.id}`);

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      findUserByEmail: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Finding user by email');
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
              Effect.tapError((error) => Effect.logError('Database error in findUserByEmail', error)),
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
            yield* Effect.logInfo(`User found with id: ${result.id}`);
          } else {
            yield* Effect.logInfo('User not found');
          }

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      findUserByEmailWithPassword: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Finding user by email');
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
              Effect.tapError((error) => Effect.logError('Database error in findUserByEmail (auth lookup)', error)),
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
            yield* Effect.logInfo(`User found with id: ${result.id}`);
          } else {
            yield* Effect.logInfo('User not found');
          }

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      findUserByIdWithPassword: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Finding user by ID');

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
              Effect.tapError((error) => Effect.logError('Database error in findUserById', error)),
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
            yield* Effect.logInfo('User found');
          } else {
            yield* Effect.logInfo('User not found');
          }

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      updateUserPassword: (userId: string, newPasswordHash: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating password for user ${userId}`);

          // Use Postgres NOW() to ensure consistent timestamps with createdAt (which also uses NOW())
          // This prevents clock skew issues between JavaScript Date and Postgres server time
          const results = yield* drizzle
            .update(usersTable)
            .set({
              passwordHash: newPasswordHash,
              passwordChangedAt: sql`NOW()`,
              updatedAt: sql`NOW()`,
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
              Effect.tapError((error) => Effect.logError('Database error in updateUserPassword', error)),
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

          yield* Effect.logInfo(`Password updated successfully for user ${userId}`);

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      updateUserEmail: (userId: string, newEmail: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Updating email for user ${userId}`);
          const canonicalEmail = newEmail.trim().toLowerCase();

          const results = yield* drizzle
            .update(usersTable)
            .set({
              email: canonicalEmail,
              updatedAt: sql`NOW()`,
            })
            .where(eq(usersTable.id, userId))
            .returning({
              id: usersTable.id,
              email: usersTable.email,
              createdAt: usersTable.createdAt,
              updatedAt: usersTable.updatedAt,
            })
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in updateUserEmail', error)),
              Effect.mapError((error) => {
                if (isUniqueConstraintViolation(error)) {
                  return new UserRepositoryError({
                    message: 'Email is already in use',
                    cause: error,
                  });
                }

                return new UserRepositoryError({
                  message: 'Failed to update user email',
                  cause: error,
                });
              }),
            );

          const result = results[0];

          if (!result) {
            return yield* Effect.fail(
              new UserRepositoryError({
                message: 'Failed to update email: no result returned',
              }),
            );
          }

          yield* Effect.logInfo(`Email updated successfully for user ${userId}`);

          return result;
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      deleteUserByEmail: (email: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo('Deleting user by email');
          const canonicalEmail = email.trim().toLowerCase();

          yield* drizzle
            .delete(usersTable)
            .where(eq(usersTable.email, canonicalEmail))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteUserByEmail', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to delete user by email',
                    cause: error,
                  }),
              ),
            );

          yield* Effect.logInfo('User deleted successfully');
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
      deleteUserById: (userId: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`Deleting user by ID ${userId}`);

          yield* drizzle
            .delete(usersTable)
            .where(eq(usersTable.id, userId))
            .pipe(
              Effect.tapError((error) => Effect.logError('Database error in deleteUserById', error)),
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to delete user by ID',
                    cause: error,
                  }),
              ),
            );

          yield* Effect.logInfo('User deleted successfully');
        }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),
    };
  }),
  accessors: true,
}) {}
