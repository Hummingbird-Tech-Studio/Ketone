import { Effect } from 'effect';
import { SignJWT } from 'jose';

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
 * @returns Effect that resolves to JWT token string
 *
 * @example
 * const token = yield* generateTestToken('user-123', 'test@example.com');
 * const shortToken = yield* generateTestToken('user-123', 'test@example.com', 1); // 1 day
 */
export const generateTestToken = (userId: string, email: string, expiresInDays: number = 7) =>
  Effect.promise(() => {
    const now = Math.floor(Date.now() / 1000);
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
 * Useful for tests that need a user + token without signup/login
 *
 * @returns Effect that resolves to { userId, email, token }
 *
 * @example
 * const { userId, email, token } = yield* createTestUser();
 * // Use token for authenticated requests
 */
export const createTestUser = () =>
  Effect.gen(function* () {
    const userId = crypto.randomUUID();
    const email = `test-${userId}@example.com`;
    const token = yield* generateTestToken(userId, email);

    return { userId, email, token };
  });
