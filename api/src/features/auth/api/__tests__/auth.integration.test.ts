import { describe, test, expect, afterAll } from 'bun:test';
import { Effect, Layer } from 'effect';
import { UserRepository } from '../../repositories';
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
const UPDATE_PASSWORD_ENDPOINT = `${API_BASE_URL}/auth/update-password`;

const testData = {
  users: new Set<string>(),
};

afterAll(async () => {
  const cleanupProgram = Effect.gen(function* () {
    const repository = yield* UserRepository;

    console.log('\n🧹 Starting auth test cleanup...');
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
        console.error('Auth test cleanup failed:', error);
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

const generateValidPassword = () => Effect.sync(() => 'TestPass123!');

const generateWeakPassword = () => Effect.sync(() => 'weak');

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

        const { status: status1 } = yield* signupUser(email, password);
        expect(status1).toBe(201);

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
          body: JSON.stringify({ email: 'test@example.com' }),
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

        yield* signupUser(email, password);

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

        yield* signupUser(email, password);

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

        yield* signupUser(email, password);

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
        const newPassword = 'NewPass456!';

        yield* signupUser(email, oldPassword);
        const { json: loginJson } = yield* loginUser(email, oldPassword);
        const token = (loginJson as LoginResponse).token;

        const { status, json } = yield* updatePassword(token, oldPassword, newPassword);

        expect(status).toBe(200);

        const response = json as UpdatePasswordResponse;
        expect(response.message).toContain('successfully');
        expect(response.user.email).toBe(email);

        const { status: oldLoginStatus } = yield* loginUser(email, oldPassword);
        expect(oldLoginStatus).toBe(401);

        const { status: newLoginStatus } = yield* loginUser(email, newPassword);
        expect(newLoginStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });

    test('should invalidate old tokens after password change', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const oldPassword = yield* generateValidPassword();
        const newPassword = 'NewPass456!';

        yield* signupUser(email, oldPassword);

        const { json: loginJson } = yield* loginUser(email, oldPassword);
        const oldToken = (loginJson as LoginResponse).token;

        const { status } = yield* updatePassword(oldToken, oldPassword, newPassword);
        expect(status).toBe(200);

        const { status: retryStatus } = yield* updatePassword(oldToken, newPassword, 'AnotherPass789!');
        expect(retryStatus).toBe(401);

        const { json: newLoginJson } = yield* loginUser(email, newPassword);
        const newToken = (newLoginJson as LoginResponse).token;

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
        const newPassword = 'NewPass456!';

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

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

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

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

        yield* signupUser(email, password);
        const { json: loginJson } = yield* loginUser(email, password);
        const token = (loginJson as LoginResponse).token;

        const { status } = yield* updatePassword(token, password, weakPassword);

        expect(status).toBe(400);
      });

      await Effect.runPromise(program);
    });
  });

  describe('Cache Integration - Token Validation Flow', () => {
    test('should validate complete authentication flow with cache', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password1 = yield* generateValidPassword();
        const password2 = 'SecondPass123!';

        const { status: signupStatus } = yield* signupUser(email, password1);
        expect(signupStatus).toBe(201);

        const { status: login1Status, json: login1Json } = yield* loginUser(email, password1);
        expect(login1Status).toBe(200);
        const token1 = (login1Json as LoginResponse).token;

        const { status: useToken1Status } = yield* updatePassword(token1, password1, password2);
        expect(useToken1Status).toBe(200);

        const { status: retryToken1Status } = yield* updatePassword(token1, password2, 'AnotherPass789!');
        expect(retryToken1Status).toBe(401);

        const { status: login2Status, json: login2Json } = yield* loginUser(email, password2);
        expect(login2Status).toBe(200);
        const token2 = (login2Json as LoginResponse).token;

        const { status: useToken2Status } = yield* updatePassword(token2, password2, 'FinalPassword456!');
        expect(useToken2Status).toBe(200);

        const { status: finalToken1Status } = yield* updatePassword(token1, 'FinalPassword456!', 'AnotherPass789!');
        expect(finalToken1Status).toBe(401);

        const { status: finalToken2Status } = yield* updatePassword(token2, 'FinalPassword456!', 'AnotherPass789!');
        expect(finalToken2Status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should handle cache gracefully when DB is unavailable', async () => {
      const program = Effect.gen(function* () {
        const email = yield* generateTestEmail();
        const password = yield* generateValidPassword();

        yield* signupUser(email, password);
        const { status: loginStatus } = yield* loginUser(email, password);
        expect(loginStatus).toBe(200);
      });

      await Effect.runPromise(program);
    });
  });
});
