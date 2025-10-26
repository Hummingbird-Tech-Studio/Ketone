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
      /**
       * Create a new user in the database
       */
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

      /**
       * Find a user by email
       */
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
    };
  }),
  accessors: true,
}) {}
