import { describe, test, expect, afterAll } from 'bun:test';
import { Effect, Layer } from 'effect';
import { UserRepository } from '../../../auth/repositories';
import { DatabaseLive, PgLive } from '../../../../db';
import {
  API_BASE_URL,
  validateJwtSecret,
  makeRequest,
  generateTestEmail,
  type ErrorResponse,
} from '../../../../test-utils';

validateJwtSecret();

const SIGNUP_ENDPOINT = `${API_BASE_URL}/auth/signup`;
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login`;
const UPDATE_EMAIL_ENDPOINT = `${API_BASE_URL}/v1/account/email`;

const testData = {
  users: new Set<string>(),
};

afterAll(async () => {
  const cleanupProgram = Effect.gen(function* () {
    const repository = yield* UserRepository;

    console.log('\n🧹 Starting user-account test cleanup...');
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
        console.error('User-account test cleanup failed:', error);
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

interface UpdateEmailResponse {
  id: string;
  email: string;
}

const generateValidPassword = () => Effect.sync(() => 'TestPass123!');

const signupUser = (email: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (status === 201) {
      testData.users.add(email);
    }

    return { status, json: json as SignupResponse | ErrorResponse };
  });

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

const updateEmail = (token: string, newEmail: string, password: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(UPDATE_EMAIL_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: newEmail, password }),
    });

    // Track new email for cleanup
    if (status === 200) {
      testData.users.add(newEmail);
    }

    return { status, json: json as UpdateEmailResponse | ErrorResponse };
  });

describe('PUT /account/email - Update Email', () => {
  describe('Success Scenarios', () => {
    test('should update email with valid password confirmation', async () => {
      const program = Effect.gen(function* () {
        const originalEmail = yield* generateTestEmail();
        const newEmail = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Signup and login
        yield* signupUser(originalEmail, password);
        const { json: loginJson } = yield* loginUser(originalEmail, password);
        const token = (loginJson as LoginResponse).token;

        // Update email
        const { status, json } = yield* updateEmail(token, newEmail, password);

        expect(status).toBe(200);

        const response = json as UpdateEmailResponse;
        expect(response.id).toBeDefined();
        expect(response.email).toBe(newEmail.toLowerCase());

        // Verify old email no longer works for login
        const { status: oldEmailLoginStatus } = yield* loginUser(originalEmail, password);
        expect(oldEmailLoginStatus).toBe(401);

        // Verify new email works for login
        const { status: newEmailLoginStatus } = yield* loginUser(newEmail, password);
        expect(newEmailLoginStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });

    test('should normalize new email to lowercase', async () => {
      const program = Effect.gen(function* () {
        const originalEmail = yield* generateTestEmail();
        const newEmail = yield* generateTestEmail();
        const uppercaseNewEmail = newEmail.toUpperCase();
        const password = yield* generateValidPassword();

        yield* signupUser(originalEmail, password);
        const { json: loginJson } = yield* loginUser(originalEmail, password);
        const token = (loginJson as LoginResponse).token;

        const { status, json } = yield* updateEmail(token, uppercaseNewEmail, password);

        expect(status).toBe(200);

        const response = json as UpdateEmailResponse;
        expect(response.email).toBe(newEmail.toLowerCase());
      });

      await Effect.runPromise(program);
    });

    test('should maintain active session after email update', async () => {
      const program = Effect.gen(function* () {
        const originalEmail = yield* generateTestEmail();
        const newEmail = yield* generateTestEmail();
        const anotherNewEmail = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(originalEmail, password);
        const { json: loginJson } = yield* loginUser(originalEmail, password);
        const token = (loginJson as LoginResponse).token;

        // First email update
        const { status: firstUpdateStatus } = yield* updateEmail(token, newEmail, password);
        expect(firstUpdateStatus).toBe(200);

        // Token should still work for another email update
        const { status: secondUpdateStatus } = yield* updateEmail(token, anotherNewEmail, password);
        expect(secondUpdateStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Invalid Password (401)', () => {
    test('should return 401 when password is incorrect', async () => {
      const program = Effect.gen(function* () {
        const originalEmail = yield* generateTestEmail();
        const newEmail = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(originalEmail, password);
        const { json: loginJson } = yield* loginUser(originalEmail, password);
        const token = (loginJson as LoginResponse).token;

        const { status, json } = yield* updateEmail(token, newEmail, 'WrongPass123!');

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('InvalidPasswordError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const newEmail = yield* generateTestEmail();

        const { status, json } = yield* makeRequest(UPDATE_EMAIL_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: newEmail, password: 'TestPass123!' }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const newEmail = yield* generateTestEmail();

        const { status, json } = yield* updateEmail('invalid-token', newEmail, 'TestPass123!');

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Same Email (400)', () => {
    test('should return 400 when new email is same as current email', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        const { status, json } = yield* updateEmail(token, email, password);

        expect(status).toBe(400);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('SameEmailError');
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when new email is same as current (case insensitive)', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        // Try to update to same email but with different case
        const { status, json } = yield* updateEmail(token, email.toUpperCase(), password);

        expect(status).toBe(400);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('SameEmailError');
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Email Already In Use (409)', () => {
    test('should return 409 when email is already used by another user', async () => {
      const program = Effect.gen(function* () {
        const email1 = yield* generateTestEmail();
        const email2 = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        // Create two users
        yield* signupUser(email1, password);
        yield* signupUser(email2, password);

        // Login as user 1
        const { json: loginJson } = yield* loginUser(email1, password);
        const token = (loginJson as LoginResponse).token;

        // Try to change user 1's email to user 2's email
        const { status, json } = yield* updateEmail(token, email2, password);

        expect(status).toBe(409);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('EmailAlreadyInUseError');
        expect(error.email).toBe(email2.toLowerCase());
      });

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when email format is invalid', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        const { status } = yield* makeRequest(UPDATE_EMAIL_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: 'invalid-email', password }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when password is missing', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const newEmail = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        const { status } = yield* makeRequest(UPDATE_EMAIL_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ email: newEmail }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });

    test('should return 400 when email is missing', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        const { status } = yield* makeRequest(UPDATE_EMAIL_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });
});
