import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { Effect } from 'effect';
import { eq, and, isNull, sql, gt } from 'drizzle-orm';
import { passwordResetTokensTable, usersTable } from '../../../db';
import { UserRepositoryError } from './errors';

const TOKEN_EXPIRATION_MINUTES = 15;

export class PasswordResetTokenRepository extends Effect.Service<PasswordResetTokenRepository>()(
  'PasswordResetTokenRepository',
  {
    effect: Effect.gen(function* () {
      const drizzle = yield* PgDrizzle.PgDrizzle;

      return {
        createToken: (userId: string, tokenHash: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordResetTokenRepository] Creating token for user ${userId}`);

            // Invalidate existing unused tokens for this user
            yield* drizzle
              .update(passwordResetTokensTable)
              .set({ usedAt: sql`NOW()` })
              .where(
                and(eq(passwordResetTokensTable.userId, userId), isNull(passwordResetTokensTable.usedAt)),
              )
              .pipe(
                Effect.catchAll((error) =>
                  Effect.logWarning(`[PasswordResetTokenRepository] Failed to invalidate old tokens: ${error}`),
                ),
              );

            const expiresAt = new Date(Date.now() + TOKEN_EXPIRATION_MINUTES * 60 * 1000);

            const results = yield* drizzle
              .insert(passwordResetTokensTable)
              .values({
                userId,
                tokenHash,
                expiresAt,
              })
              .returning()
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in createToken', error)),
                Effect.mapError(
                  (error) =>
                    new UserRepositoryError({
                      message: 'Failed to create password reset token',
                      cause: error,
                    }),
                ),
              );

            const result = results[0];
            if (!result) {
              return yield* Effect.fail(
                new UserRepositoryError({
                  message: 'Failed to create token: no result returned',
                }),
              );
            }

            yield* Effect.logInfo(`[PasswordResetTokenRepository] Token created for user ${userId}`);
            return result;
          }),

        findValidTokenByHash: (tokenHash: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordResetTokenRepository] Finding valid token by hash`);

            const results = yield* drizzle
              .select({
                id: passwordResetTokensTable.id,
                userId: passwordResetTokensTable.userId,
                tokenHash: passwordResetTokensTable.tokenHash,
                expiresAt: passwordResetTokensTable.expiresAt,
                usedAt: passwordResetTokensTable.usedAt,
                createdAt: passwordResetTokensTable.createdAt,
              })
              .from(passwordResetTokensTable)
              .where(
                and(
                  eq(passwordResetTokensTable.tokenHash, tokenHash),
                  isNull(passwordResetTokensTable.usedAt),
                  gt(passwordResetTokensTable.expiresAt, sql`NOW()`),
                ),
              )
              .limit(1)
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in findValidTokenByHash', error)),
                Effect.mapError(
                  (error) =>
                    new UserRepositoryError({
                      message: 'Failed to find password reset token',
                      cause: error,
                    }),
                ),
              );

            return results[0] || null;
          }),

        markTokenAsUsed: (tokenId: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordResetTokenRepository] Marking token ${tokenId} as used`);

            yield* drizzle
              .update(passwordResetTokensTable)
              .set({ usedAt: sql`NOW()` })
              .where(eq(passwordResetTokensTable.id, tokenId))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in markTokenAsUsed', error)),
                Effect.mapError(
                  (error) =>
                    new UserRepositoryError({
                      message: 'Failed to mark token as used',
                      cause: error,
                    }),
                ),
              );

            yield* Effect.logInfo(`[PasswordResetTokenRepository] Token marked as used`);
          }),

        countRecentTokensByEmail: (email: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordResetTokenRepository] Counting recent tokens for email`);
            const canonicalEmail = email.trim().toLowerCase();
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            const results = yield* drizzle
              .select({ count: sql<number>`count(*)::int` })
              .from(passwordResetTokensTable)
              .innerJoin(usersTable, eq(passwordResetTokensTable.userId, usersTable.id))
              .where(and(eq(usersTable.email, canonicalEmail), gt(passwordResetTokensTable.createdAt, oneHourAgo)))
              .pipe(
                Effect.tapError((error) => Effect.logError('Database error in countRecentTokensByEmail', error)),
                Effect.mapError(
                  (error) =>
                    new UserRepositoryError({
                      message: 'Failed to count recent tokens',
                      cause: error,
                    }),
                ),
              );

            return results[0]?.count ?? 0;
          }),
      };
    }),
    accessors: true,
  },
) {}
