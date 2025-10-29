import { describe, test, expect, afterAll } from 'bun:test';
import { Effect, Layer } from 'effect';
import { UserRepository } from '../../repositories';
import { DatabaseLive } from '../../../../db';

/**
 * Integration Tests for Authentication Service
 *
 * Tests using Effect-TS patterns and domain schemas:
 * 1. Signup - Success scenarios
 * 2. Signup - Error scenarios (409, 400)
 * 3. Login - Success scenarios
 * 4. Login - Error scenarios (401, 400)
 * 5. Update Password - Success scenarios
 * 6. Update Password - Error scenarios (401, 400)
 * 7. Token validation and invalidation
 */

// ============================================================================
// Test Configuration
// ============================================================================

const API_BASE_URL = 'http://localhost:3000';
const SIGNUP_ENDPOINT = `${API_BASE_URL}/auth/signup`;
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;
const UPDATE_PASSWORD_ENDPOINT = `${API_BASE_URL}/auth/update-password`;

// JWT_SECRET must match the server's configuration
if (!Bun.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required for tests.');
}

// ============================================================================
// Test Data Tracking
// ============================================================================

/**
 * Track test user emails for cleanup
 * We explicitly track what we create so we only delete test data
 */
const testData = {
  userEmails: new Set<string>(),
};

// ============================================================================
// Test Cleanup
// ============================================================================

/**
 * Cleanup test data from database after all tests complete
 * Only removes data that was explicitly created during test execution
 */
afterAll(async () => {
  const cleanupProgram = Effect.gen(function* () {
    const repository = yield* UserRepository;

    console.log('\n🧹 Starting auth test cleanup...');
    console.log(`📊 Tracked test users: ${testData.userEmails.size}`);

    if (testData.userEmails.size === 0) {
      console.log('⚠️  No test data to clean up');
      return;
    }

    // Delete users for all test emails in parallel
    const emailsArray = Array.from(testData.userEmails);

    yield* Effect.all(
      emailsArray.map((email) =>
        Effect.gen(function* () {
          yield* repository.deleteUserByEmail(email);
        }),
      ),
      { concurrency: 'unbounded' },
    );

    console.log(`✅ Deleted ${testData.userEmails.size} test users`);
    console.log('✅ Auth test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(UserRepository.Default.pipe(Layer.provide(DatabaseLive))),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  Auth test cleanup failed:', error);
        // Don't fail the test suite if cleanup fails
      }),
    ),
  );

  await Effect.runPromise(cleanupProgram);
});

interface UserResponse {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface SignupResponse {
  user: UserResponse;
}

interface LoginResponse {
  token: string;
  user: UserResponse;
}

interface UpdatePasswordResponse {
  message: string;
  user: UserResponse;
}

interface ErrorResponse {
  _tag: string;
  message: string;
  email?: string;
}

// ============================================================================
// Test Utilities - Using Effect patterns
// ============================================================================

/**
 * Generate a test email with unique timestamp
 */
const generateTestEmail = () =>
  Effect.sync(() => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@example.com`;
  });

/**
 * Generate a valid test password
 * Must meet requirements: 8-100 chars, uppercase, lowercase, number, special char
 */
const generateValidPassword = () => Effect.sync(() => 'TestPass123!');

/**
 * Generate a weak password (missing requirements)
 */
const generateWeakPassword = () => Effect.sync(() => 'weak');

/**
 * Make HTTP request with Effect
 */
const makeRequest = (url: string, options: RequestInit) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, options),
      catch: (error) => new Error(`HTTP request failed: ${error}`),
    });

    const status = response.status;
    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => ({}),
    });

    return { status, json, response };
  });

/**
 * Signup a new user
 * Automatically tracks the email for cleanup
 */
const signupUser = (email: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    // Track email for cleanup if signup was successful
    if (status === 201) {
      testData.userEmails.add(email);
    }

    return { status, json: json as SignupResponse | ErrorResponse };
  });

/**
 * Login a user
 */
const loginUser = (email: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    return { status, json: json as LoginResponse | ErrorResponse };
  });

/**
 * Update user password
 */
const updatePassword = (token: string, currentPassword: string, newPassword: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(UPDATE_PASSWORD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    return { status, json: json as UpdatePasswordResponse | ErrorResponse };
  });

// ============================================================================
// Tests
// ============================================================================

describe('POST /auth/signup - User Registration', () => {
  describe('Success Scenarios', () => {
    test('should register a new user with valid credentials', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        const { status, json } = yield* signupUser(email, password);

        expect(status).toBe(201);

        const response = json as SignupResponse;
        expect(response.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(response.user.email).toBe(email);
        expect(response.user.createdAt).toBeDefined();
        expect(response.user.updatedAt).toBeDefined();
      });

      await Effect.runPromise(program);
    });

    test('should normalize email to lowercase', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const uppercaseEmail = email.toUpperCase();
        const password = yield* generateValidPassword();

        const { status, json } = yield* signupUser(uppercaseEmail, password);

        expect(status).toBe(201);

        const response = json as SignupResponse;
        expect(response.user.email).toBe(email.toLowerCase());
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - User Already Exists (409)', () => {
    test('should return 409 when email is already registered', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // First signup - should succeed
        const { status: status1 } = yield* signupUser(email, password);
        expect(status1).toBe(201);

        // Second signup with same email - should fail
        const { status: status2, json } = yield* signupUser(email, password);
        expect(status2).toBe(409);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UserAlreadyExistsError');
        expect(error.message).toContain('already exists');
        expect(error.email).toBe(email);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when password is too weak', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateWeakPassword();

        const { status } = yield* makeRequest(SIGNUP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when email format is invalid', async () => {
      const program = Effect.gen(function* () {
        const password = yield* generateValidPassword();

        const { status } = yield* makeRequest(SIGNUP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'invalid-email', password }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when password equals email', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();

        const { status } = yield* makeRequest(SIGNUP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password: email }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when missing required fields', async () => {
      const program = Effect.gen(function* () {
        const { status } = yield* makeRequest(SIGNUP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com' }), // Missing password
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });
});

describe('POST /auth/login - User Login', () => {
  describe('Success Scenarios', () => {
    test('should login with valid credentials and return JWT token', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Signup first
        yield* signupUser(email, password);

        // Then login
        const { status, json } = yield* loginUser(email, password);

        expect(status).toBe(200);

        const response = json as LoginResponse;
        expect(response.token).toBeDefined();
        expect(response.token.length).toBeGreaterThan(0);
        expect(response.user.email).toBe(email);
        expect(response.user.id).toBeDefined();
      });

      await Effect.runPromise(program);
    });

    test('should login with case-insensitive email', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Signup with lowercase
        yield* signupUser(email, password);

        // Login with uppercase
        const { status, json } = yield* loginUser(email.toUpperCase(), password);

        expect(status).toBe(200);

        const response = json as LoginResponse;
        expect(response.user.email).toBe(email.toLowerCase());
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Invalid Credentials (401)', () => {
    test('should return 401 when password is incorrect', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Signup first
        yield* signupUser(email, password);

        // Login with wrong password
        const { status, json } = yield* loginUser(email, 'WrongPass123!');

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('InvalidCredentialsError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when user does not exist', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Login without signup
        const { status, json } = yield* loginUser(email, password);

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('InvalidCredentialsError');
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when email is missing', async () => {
      const program = Effect.gen(function* () {
        const { status } = yield* makeRequest(LOGIN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: 'TestPass123!' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when password is missing', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();

        const { status } = yield* makeRequest(LOGIN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });
});

describe('POST /auth/update-password - Update Password', () => {
  describe('Success Scenarios', () => {
    test('should update password with valid token and credentials', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const oldPassword = yield* generateValidPassword();
        const newPassword = Effect.runSync(Effect.sync(() => 'NewPass456!'));

        // Signup and login
        yield* signupUser(email, oldPassword);
        const { json: loginJson } = yield* loginUser(email, oldPassword);
        const token = (loginJson as LoginResponse).token;

        // Update password
        const { status, json } = yield* updatePassword(token, oldPassword, newPassword);

        expect(status).toBe(200);

        const response = json as UpdatePasswordResponse;
        expect(response.message).toContain('successfully');
        expect(response.user.email).toBe(email);

        // Verify old password no longer works
        const { status: oldLoginStatus } = yield* loginUser(email, oldPassword);
        expect(oldLoginStatus).toBe(401);

        // Verify new password works
        const { status: newLoginStatus } = yield* loginUser(email, newPassword);
        expect(newLoginStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });

    test('should invalidate old tokens after password change', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const oldPassword = yield* generateValidPassword();
        const newPassword = Effect.runSync(Effect.sync(() => 'NewPass456!'));

        // Signup and login to get a token
        // NOTE: Signup initializes Orleans UserAuth actor with user.createdAt
        yield* signupUser(email, oldPassword);

        // Login synchronizes Orleans with DB and generates token
        // Token iat will be AFTER Orleans passwordChangedAt (createdAt)
        const { json: loginJson } = yield* loginUser(email, oldPassword);
        const oldToken = (loginJson as LoginResponse).token;

        // Update password (using the old token)
        // This updates Orleans passwordChangedAt to NOW
        const { status } = yield* updatePassword(oldToken, oldPassword, newPassword);
        expect(status).toBe(200);

        // Try to use old token again - should fail
        // Old token iat < new passwordChangedAt, so Orleans invalidates it
        const { status: retryStatus } = yield* updatePassword(oldToken, newPassword, 'AnotherPass789!');
        expect(retryStatus).toBe(401);

        // Login with new password to get new token
        const { json: newLoginJson } = yield* loginUser(email, newPassword);
        const newToken = (newLoginJson as LoginResponse).token;

        // New token should work (iat > passwordChangedAt)
        const { status: newTokenStatus } = yield* updatePassword(newToken, newPassword, 'FinalPass000!');
        expect(newTokenStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Invalid Credentials (401)', () => {
    test('should return 401 when current password is incorrect', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();
        const newPassword = Effect.runSync(Effect.sync(() => 'NewPass456!'));

        // Signup and login
        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        // Try to update with wrong current password
        const { status, json } = yield* updatePassword(token, 'WrongPass123!', newPassword);

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('InvalidCredentialsError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(UPDATE_PASSWORD_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: 'TestPass123!',
            newPassword: 'NewPass456!',
          }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* updatePassword('invalid-token', 'TestPass123!', 'NewPass456!');

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when new password is same as current password', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Signup and login
        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        // Try to update with same password
        const { status } = yield* updatePassword(token, password, password);

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when new password is weak', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();
        const weakPassword = yield* generateWeakPassword();

        // Signup and login
        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        // Try to update with weak password
        const { status } = yield* updatePassword(token, password, weakPassword);

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });

  // ============================================================================
  describe('Orleans Integration - Token Validation Flow', () => {
    test('should validate complete authentication flow with Orleans', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password1 = yield* generateValidPassword();
        const password2 = Effect.runSync(Effect.sync(() => 'SecondPass123!'));

        // ===== STEP 1: Signup =====
        // - Creates user in DB with createdAt
        // - Initializes Orleans UserAuth actor with passwordChangedAt = createdAt
        const { status: signupStatus } = yield* signupUser(email, password1);
        expect(signupStatus).toBe(201);

        // ===== STEP 2: First Login =====
        // - Verifies credentials
        // - Synchronizes Orleans with DB (passwordChangedAt = createdAt)
        // - Generates token1 with iat > createdAt
        const { status: login1Status, json: login1Json } = yield* loginUser(email, password1);
        expect(login1Status).toBe(200);
        const token1 = (login1Json as LoginResponse).token;

        // ===== STEP 3: Use Token1 Successfully =====
        // - Middleware verifies JWT signature
        // - Calls Orleans: validateToken(userId, token1.iat)
        // - Orleans: token1.iat >= passwordChangedAt (createdAt) ✓
        // - Allows request
        const { status: useToken1Status } = yield* updatePassword(token1, password1, password2);
        expect(useToken1Status).toBe(200);
        // NOTE: Password change updates Orleans passwordChangedAt to NOW

        // ===== STEP 4: Try Token1 After Password Change =====
        // - Middleware verifies JWT signature
        // - Calls Orleans: validateToken(userId, token1.iat)
        // - Orleans: token1.iat < new passwordChangedAt ✗
        // - Rejects request with 401
        const { status: retryToken1Status } = yield* updatePassword(token1, password2, 'AnotherPass789!');
        expect(retryToken1Status).toBe(401);

        // ===== STEP 5: Login with New Password =====
        // - Verifies new credentials
        // - Synchronizes Orleans (passwordChangedAt already updated)
        // - Generates token2 with iat > new passwordChangedAt
        const { status: login2Status, json: login2Json } = yield* loginUser(email, password2);
        expect(login2Status).toBe(200);
        const token2 = (login2Json as LoginResponse).token;

        // ===== STEP 6: Use Token2 Successfully =====
        // - Middleware verifies JWT signature
        // - Calls Orleans: validateToken(userId, token2.iat)
        // - Orleans: token2.iat >= new passwordChangedAt ✓
        // - Allows request
        const { status: useToken2Status } = yield* updatePassword(token2, password2, 'FinalPassword456!');
        expect(useToken2Status).toBe(200);

        // ===== VERIFICATION =====
        // - Old token (token1) is permanently invalidated
        // - New token (token2) is also now invalidated by third password change
        const { status: finalToken1Status } = yield* updatePassword(token1, 'FinalPassword456!', 'AnotherPass789!');
        expect(finalToken1Status).toBe(401);

        const { status: finalToken2Status } = yield* updatePassword(token2, 'FinalPassword456!', 'AnotherPass789!');
        expect(finalToken2Status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should handle Orleans gracefully when unavailable', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // NOTE: This test documents the behavior when Orleans is down
        // In production:
        // 1. Signup/Login will log warnings but succeed (Orleans init fails gracefully)
        // 2. Token validation will allow requests (falls back to JWT validation only)
        // 3. Password changes will succeed in DB but not invalidate old tokens immediately

        // For this test, we just verify the happy path works
        // Orleans resilience is tested by actually stopping the Orleans sidecar
        yield* signupUser(email, password);
        const { status: loginStatus } = yield* loginUser(email, password);
        expect(loginStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });
  });
});
