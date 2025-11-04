import { Effect } from 'effect';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { usersTable, cyclesTable } from '../db';

/**
 * Authentication Test Utilities
 * JWT token generation and user creation helpers
 */

/**
 * Validate JWT_SECRET environment variable
 * Throws error if not set - call this at the top of your test file
 *
 * @example
 * validateJwtSecret(); // Call before running any tests
 */
export function validateJwtSecret(): void {
  if (!Bun.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for tests.');
  }
}

/**
 * Generate a test JWT token
 *
 * @param userId - User ID for the token
 * @param email - Email for the token
 * @param expiresInDays - Token expiration in days (default: 7)
 * @param issuedAt - Optional custom issued-at timestamp in seconds (default: Date.now())
 * @returns Effect that resolves to JWT token string
 *
 * @example
 * const token = yield* generateTestToken('user-123', 'test@example.com');
 * const shortToken = yield* generateTestToken('user-123', 'test@example.com', 1); // 1 day
 * const customToken = yield* generateTestToken('user-123', 'test@example.com', 7, 1699900000); // Custom iat
 */
export const generateTestToken = (userId: string, email: string, expiresInDays: number = 7, issuedAt?: number) =>
  Effect.promise(() => {
    const now = issuedAt ?? Math.floor(Date.now() / 1000);
    const exp = now + expiresInDays * 24 * 60 * 60;

    return new SignJWT({
      userId,
      email,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(Bun.env.JWT_SECRET!));
  });

/**
 * Generate an expired JWT token for testing
 *
 * @param userId - User ID for the token
 * @param email - Email for the token
 * @param expiredHoursAgo - How many hours ago the token expired (default: 1)
 * @returns Effect that resolves to expired JWT token string
 *
 * @example
 * const expiredToken = yield* generateExpiredToken('user-123', 'test@example.com');
 * // Use this to test 401 Unauthorized responses
 */
export const generateExpiredToken = (userId: string, email: string, expiredHoursAgo: number = 1) =>
  Effect.promise(() => {
    const now = Math.floor(Date.now() / 1000);
    const hoursInSeconds = expiredHoursAgo * 60 * 60;

    return new SignJWT({
      userId,
      email,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(now - hoursInSeconds * 2)
      .setExpirationTime(now - hoursInSeconds)
      .sign(new TextEncoder().encode(Bun.env.JWT_SECRET!));
  });

/**
 * Generate a unique test email address
 * Uses timestamp and random string to ensure uniqueness
 *
 * @returns Effect that resolves to unique email string
 *
 * @example
 * const email = yield* generateTestEmail();
 * // Returns: test-1730050000000-abc123@example.com
 */
export const generateTestEmail = () =>
  Effect.sync(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@example.com`;
  });

/**
 * Create a test user with a valid token
 * Creates the user in the database and generates a JWT token
 * Token iat is synchronized with database createdAt to prevent race conditions
 *
 * @returns Effect that resolves to { userId, email, token }
 *
 * @example
 * const { userId, email, token } = yield* createTestUser();
 * // Use token for authenticated requests
 */
export const createTestUser = () =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const email = `test-${crypto.randomUUID()}@example.com`;
    const passwordHash = 'test-password-hash-not-used-in-tests';

    const result = yield* drizzle
      .insert(usersTable)
      .values({
        email,
        passwordHash,
      })
      .returning();

    if (!result[0]) {
      return yield* Effect.fail(new Error('Failed to create test user'));
    }

    const user = result[0];

    // Use database createdAt timestamp for token to avoid race conditions
    // Convert to Unix seconds and add 1 second buffer to ensure token iat >= createdAt
    const createdAtSeconds = Math.floor(user.createdAt.getTime() / 1000) + 1;
    const token = yield* generateTestToken(user.id, email, 7, createdAtSeconds);

    return { userId: user.id, email, token };
  });

/**
 * Delete a test user from the database
 * Used for cleanup after tests
 * Deletes all user cycles first, then deletes the user
 *
 * @param userId - User ID to delete
 * @returns Effect that resolves when user is deleted
 *
 * @example
 * yield* deleteTestUser(userId);
 */
export const deleteTestUser = (userId: string) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    // First, delete all cycles for this user
    yield* drizzle
      .delete(cyclesTable)
      .where(eq(cyclesTable.userId, userId))
      .pipe(
        Effect.catchAll((error) => {
          console.log(`⚠️  Failed to delete cycles for user ${userId}:`, error);
          return Effect.succeed(undefined);
        })
      );

    // Then, delete the user
    yield* drizzle
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .pipe(
        Effect.catchAll((error) => {
          console.log(`⚠️  Failed to delete user ${userId}:`, error);
          return Effect.succeed(undefined);
        })
      );
  });
