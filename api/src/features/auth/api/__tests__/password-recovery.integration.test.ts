import { describe, test, expect, afterAll } from 'bun:test';
import { Effect, Layer } from 'effect';
import { eq, and, isNull, gt, desc } from 'drizzle-orm';
import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { UserRepository } from '../../repositories';
import { DatabaseLive, PgLive, passwordResetTokensTable, usersTable } from '../../../../db';
import {
  API_BASE_URL,
  validateJwtSecret,
  makeRequest,
  generateTestEmail,
  type ErrorResponse,
} from '../../../../test-utils';

validateJwtSecret();

const SIGNUP_ENDPOINT = `${API_BASE_URL}/auth/signup`;
const FORGOT_PASSWORD_ENDPOINT = `${API_BASE_URL}/auth/forgot-password`;
const RESET_PASSWORD_ENDPOINT = `${API_BASE_URL}/auth/reset-password`;
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;

const testData = {
  users: new Set<string>(),
};

afterAll(async () => {
  const cleanupProgram = Effect.gen(function* () {
    const repository = yield* UserRepository;

    console.log('\n🧹 Starting password recovery test cleanup...');
    console.log(`📊 Tracked test users: ${testData.users.size}`);

    if (testData.users.size === 0) {
      console.log('⚠️  No test data to clean up');
      return;
    }

    yield* Effect.all(
      Array.from(testData.users).map((email) => repository.deleteUserByEmail(email)),
      { concurrency: 'unbounded' },
    );
  }).pipe(
    Effect.provide(Layer.mergeAll(UserRepository.Default.pipe(Layer.provide(DatabaseLive)), PgLive)),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('Password recovery test cleanup failed:', error);
      }),
    ),
  );

  await Effect.runPromise(cleanupProgram);
});

interface MessageResponse {
  message: string;
}

const generateValidPassword = () => Effect.sync(() => 'TestPass123!');
const generateNewPassword = () => Effect.sync(() => 'NewPass456@');

const signupUser = (email: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (status === 201) {
      testData.users.add(email);
    }

    return { status, json };
  });

const forgotPassword = (email: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(FORGOT_PASSWORD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    return { status, json: json as MessageResponse | ErrorResponse };
  });

const resetPassword = (token: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(RESET_PASSWORD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    return { status, json: json as MessageResponse | ErrorResponse };
  });

const loginUser = (email: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    return { status, json };
  });

/**
 * Helper to get raw token from database for testing
 * In real flow, this would come from email
 */
const getLatestTokenForEmail = (email: string) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const canonicalEmail = email.trim().toLowerCase();

    const results = yield* drizzle
      .select({
        id: passwordResetTokensTable.id,
        tokenHash: passwordResetTokensTable.tokenHash,
        expiresAt: passwordResetTokensTable.expiresAt,
      })
      .from(passwordResetTokensTable)
      .innerJoin(usersTable, eq(passwordResetTokensTable.userId, usersTable.id))
      .where(
        and(
          eq(usersTable.email, canonicalEmail),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(passwordResetTokensTable.createdAt))
      .limit(1);

    return results[0] || null;
  });

/**
 * Helper to create a raw token and get both the raw token and its hash
 * This simulates what the email would contain
 */
const createTestToken = () =>
  Effect.sync(() => {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const rawToken = Buffer.from(randomBytes).toString('base64url');
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(rawToken);
    const tokenHash = hasher.digest('hex');
    return { rawToken, tokenHash };
  });

/**
 * Helper to insert a token directly into the database for testing
 */
const insertTestToken = (userId: string, tokenHash: string, expiresAt: Date) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    const results = yield* drizzle
      .insert(passwordResetTokensTable)
      .values({
        userId,
        tokenHash,
        expiresAt,
      })
      .returning();

    return results[0];
  });

/**
 * Helper to get user ID by email
 */
const getUserIdByEmail = (email: string) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;
    const canonicalEmail = email.trim().toLowerCase();

    const results = yield* drizzle
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, canonicalEmail))
      .limit(1);

    return results[0]?.id || null;
  });

describe('POST /auth/forgot-password - Request Password Reset', () => {
  describe('Success Scenarios', () => {
    test('should return 200 with message when user exists', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Create user first
        yield* signupUser(email, password);

        // Request password reset
        const { status, json } = yield* forgotPassword(email);

        expect(status).toBe(200);
        const response = json as MessageResponse;
        expect(response.message).toBe('If an account exists, a reset email has been sent');
      });

      await Effect.runPromise(program);
    });

    test('should return 200 with same message when user does not exist (prevent enumeration)', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        // Don't create user - email doesn't exist

        const { status, json } = yield* forgotPassword(email);

        expect(status).toBe(200);
        const response = json as MessageResponse;
        expect(response.message).toBe('If an account exists, a reset email has been sent');
      });

      await Effect.runPromise(program);
    });

    test('should normalize email to lowercase', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);

        // Request with uppercase email
        const { status, json } = yield* forgotPassword(email.toUpperCase());

        expect(status).toBe(200);
        const response = json as MessageResponse;
        expect(response.message).toBe('If an account exists, a reset email has been sent');
      });

      await Effect.runPromise(program);
    });

    test('should still return 200 after IP rate limit is reached (prevent information leaking)', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);

        // Request 6 times (IP limit is 5 per hour)
        // Rate limiting is now by IP, not by account, to prevent DoS attacks
        // where an attacker could block a legitimate user from resetting their password
        for (let i = 0; i < 6; i++) {
          const { status, json } = yield* forgotPassword(email);
          expect(status).toBe(200);
          const response = json as MessageResponse;
          expect(response.message).toBe('If an account exists, a reset email has been sent');
        }
      });

      await Effect.runPromise(program);
    });

    test('should allow different emails from same IP (rate limit is per IP, not per account)', async () => {
      const program = Effect.gen(function* () {
        // Create multiple users
        const users = [];
        for (let i = 0; i < 3; i++) {
          const email = yield* generateTestEmail();
          const password = yield* generateValidPassword();
          yield* signupUser(email, password);
          users.push(email);
        }

        // Request password reset for each user - all should succeed initially
        // This demonstrates that rate limiting is not per account
        for (const email of users) {
          const { status, json } = yield* forgotPassword(email);
          expect(status).toBe(200);
          const response = json as MessageResponse;
          expect(response.message).toBe('If an account exists, a reset email has been sent');
        }
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when email format is invalid', async () => {
      const program = Effect.gen(function* () {
        const { status } = yield* makeRequest(FORGOT_PASSWORD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'invalid-email' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when email is missing', async () => {
      const program = Effect.gen(function* () {
        const { status } = yield* makeRequest(FORGOT_PASSWORD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });
});

describe('POST /auth/reset-password - Reset Password with Token', () => {
  describe('Success Scenarios', () => {
    test('should reset password with valid token', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();
        const newPassword = yield* generateNewPassword();

        // Create user
        yield* signupUser(email, password);

        // Get user ID
        const userId = yield* getUserIdByEmail(email);
        expect(userId).not.toBeNull();

        // Create test token directly in DB
        const { rawToken, tokenHash } = yield* createTestToken();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        yield* insertTestToken(userId!, tokenHash, expiresAt);

        // Reset password
        const { status, json } = yield* resetPassword(rawToken, newPassword);

        expect(status).toBe(200);
        const response = json as MessageResponse;
        expect(response.message).toBe('Password has been reset successfully');

        // Verify can login with new password
        const { status: loginStatus } = yield* loginUser(email, newPassword);
        expect(loginStatus).toBe(200);

        // Verify cannot login with old password
        const { status: oldLoginStatus } = yield* loginUser(email, password);
        expect(oldLoginStatus).toBe(401);
      }).pipe(Effect.provide(DatabaseLive), Effect.provide(PgLive));

      await Effect.runPromise(program);
    });

    test('should invalidate token after use', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();
        const newPassword = yield* generateNewPassword();

        yield* signupUser(email, password);
        const userId = yield* getUserIdByEmail(email);

        const { rawToken, tokenHash } = yield* createTestToken();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        yield* insertTestToken(userId!, tokenHash, expiresAt);

        // First reset should succeed
        const { status: status1 } = yield* resetPassword(rawToken, newPassword);
        expect(status1).toBe(200);

        // Second reset with same token should fail
        const { status: status2, json } = yield* resetPassword(rawToken, 'AnotherPass789!');
        expect(status2).toBe(400);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('PasswordResetTokenInvalidError');
      }).pipe(Effect.provide(DatabaseLive), Effect.provide(PgLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Invalid Token (400)', () => {
    test('should return 400 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const newPassword = yield* generateNewPassword();

        const { status, json } = yield* resetPassword('invalid-token-123', newPassword);

        expect(status).toBe(400);
        const error = json as ErrorResponse;
        expect(error._tag).toBe('PasswordResetTokenInvalidError');
        expect(error.message).toContain('Invalid or expired');
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when token is expired', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();
        const newPassword = yield* generateNewPassword();

        yield* signupUser(email, password);
        const userId = yield* getUserIdByEmail(email);

        // Create expired token
        const { rawToken, tokenHash } = yield* createTestToken();
        const expiresAt = new Date(Date.now() - 60 * 1000); // Expired 1 minute ago
        yield* insertTestToken(userId!, tokenHash, expiresAt);

        const { status, json } = yield* resetPassword(rawToken, newPassword);

        expect(status).toBe(400);
        const error = json as ErrorResponse;
        expect(error._tag).toBe('PasswordResetTokenInvalidError');
      }).pipe(Effect.provide(DatabaseLive), Effect.provide(PgLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when token format is empty', async () => {
      const program = Effect.gen(function* () {
        const newPassword = yield* generateNewPassword();

        const { status } = yield* resetPassword('', newPassword);

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when password is too weak', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const userId = yield* getUserIdByEmail(email);

        const { rawToken, tokenHash } = yield* createTestToken();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        yield* insertTestToken(userId!, tokenHash, expiresAt);

        // Try to reset with weak password
        const { status } = yield* resetPassword(rawToken, 'weak');

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive), Effect.provide(PgLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when password is missing', async () => {
      const program = Effect.gen(function* () {
        const { status } = yield* makeRequest(RESET_PASSWORD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'some-token' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when token is missing', async () => {
      const program = Effect.gen(function* () {
        const newPassword = yield* generateNewPassword();

        const { status } = yield* makeRequest(RESET_PASSWORD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });
});

describe('Password Recovery Flow - End to End', () => {
  test('should complete full password recovery flow', async () => {
    const program = Effect.gen(function* () {
      const email = yield* generateTestEmail();
      const password = yield* generateValidPassword();
      const newPassword = yield* generateNewPassword();

      // 1. Create user
      const { status: signupStatus } = yield* signupUser(email, password);
      expect(signupStatus).toBe(201);

      // 2. Verify can login with original password
      const { status: loginStatus1 } = yield* loginUser(email, password);
      expect(loginStatus1).toBe(200);

      // 3. Request password reset
      const { status: forgotStatus } = yield* forgotPassword(email);
      expect(forgotStatus).toBe(200);

      // 4. Get user ID and create token for testing (simulating email link)
      const userId = yield* getUserIdByEmail(email);
      const { rawToken, tokenHash } = yield* createTestToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      yield* insertTestToken(userId!, tokenHash, expiresAt);

      // 5. Reset password
      const { status: resetStatus } = yield* resetPassword(rawToken, newPassword);
      expect(resetStatus).toBe(200);

      // 6. Verify cannot login with old password
      const { status: loginStatus2 } = yield* loginUser(email, password);
      expect(loginStatus2).toBe(401);

      // 7. Verify can login with new password
      const { status: loginStatus3 } = yield* loginUser(email, newPassword);
      expect(loginStatus3).toBe(200);
    }).pipe(Effect.provide(DatabaseLive), Effect.provide(PgLive));

    await Effect.runPromise(program);
  });
});
