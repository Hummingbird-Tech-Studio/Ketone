import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect, Layer } from 'effect';
import { eq } from 'drizzle-orm';
import { usersTable } from '../../../db';
import { UserRepositoryError } from './errors';

/**
 * User Repository Service
 * Handles database operations for users
 */

export class UserRepository extends Effect.Service<UserRepository>()('UserRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      /**
       * Create a new user in the database
       */
      createUser: (email: string, passwordHash: string) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[UserRepository] Creating user with email: ${email}`);

          const results = yield* drizzle
            .insert(usersTable)
            .values({
              email,
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
              Effect.mapError(
                (error) =>
                  new UserRepositoryError({
                    message: 'Failed to create user in database',
                    cause: error,
                  }),
              ),
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
          yield* Effect.logInfo(`[UserRepository] Finding user by email: ${email}`);

          const results = yield* drizzle
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
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
