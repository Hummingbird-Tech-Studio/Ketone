import { describe, test, expect, afterAll } from 'bun:test';
import { Effect, Schema as S } from 'effect';
import {
  API_BASE_URL,
  validateJwtSecret,
  makeRequest,
  createTestUser,
  deleteTestUser,
  type ErrorResponse,
} from '../../../../test-utils';
import { DatabaseLive } from '../../../../db';
import { ProfileResponseSchema } from '../schemas';

validateJwtSecret();

const PROFILE_ENDPOINT = `${API_BASE_URL}/v1/profile`;

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting profile test cleanup...');
  console.log(`📊 Tracked test users: ${testData.userIds.size}`);

  if (testData.userIds.size === 0) {
    console.log('⚠️  No test data to clean up');
    return;
  }

  const cleanupProgram = Effect.gen(function* () {
    yield* Effect.all(
      Array.from(testData.userIds).map((userId) => deleteTestUser(userId)),
      { concurrency: 'unbounded' },
    );

    console.log('✅ Profile test cleanup completed');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('Profile test cleanup failed:', error);
      }),
    ),
  );

  await Effect.runPromise(cleanupProgram).catch((error) => {
    console.error('⚠️  Cleanup error:', error);
  });
});

const createTestUserWithTracking = () =>
  Effect.gen(function* () {
    const user = yield* createTestUser();
    testData.userIds.add(user.userId);
    return user;
  });

// Use Encoded type to match the JSON response shape (dates as strings)
type ProfileResponse = S.Schema.Encoded<typeof ProfileResponseSchema>;

const saveProfile = (token: string, data: { name?: string | null; dateOfBirth?: string | null }) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(PROFILE_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    return { status, json: json as ProfileResponse | ErrorResponse };
  });

describe('PUT /v1/profile - Save Profile', () => {
  describe('Success Scenarios', () => {
    test('should create a new profile with name and dateOfBirth', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        const { status, json } = yield* saveProfile(token, {
          name: 'John Doe',
          dateOfBirth: '1990-05-15',
        });

        expect(status).toBe(200);

        const response = json as ProfileResponse;
        expect(response.id).toBeDefined();
        expect(response.userId).toBe(userId);
        expect(response.name).toBe('John Doe');
        expect(response.dateOfBirth).toBe('1990-05-15');
        expect(response.createdAt).toBeDefined();
        expect(response.updatedAt).toBeDefined();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should create a profile with only name', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* saveProfile(token, {
          name: 'Jane Doe',
        });

        expect(status).toBe(200);

        const response = json as ProfileResponse;
        expect(response.name).toBe('Jane Doe');
        expect(response.dateOfBirth).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should create a profile with only dateOfBirth', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* saveProfile(token, {
          dateOfBirth: '1985-12-25',
        });

        expect(status).toBe(200);

        const response = json as ProfileResponse;
        expect(response.name).toBeNull();
        expect(response.dateOfBirth).toBe('1985-12-25');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should create a profile with empty body', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        const { status, json } = yield* saveProfile(token, {});

        expect(status).toBe(200);

        const response = json as ProfileResponse;
        expect(response.userId).toBe(userId);
        expect(response.name).toBeNull();
        expect(response.dateOfBirth).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should update an existing profile', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create initial profile
        const { status: status1, json: json1 } = yield* saveProfile(token, {
          name: 'Initial Name',
          dateOfBirth: '1990-01-01',
        });

        expect(status1).toBe(200);
        const profile1 = json1 as ProfileResponse;
        expect(profile1.name).toBe('Initial Name');

        // Update profile
        const { status: status2, json: json2 } = yield* saveProfile(token, {
          name: 'Updated Name',
          dateOfBirth: '1995-06-15',
        });

        expect(status2).toBe(200);
        const profile2 = json2 as ProfileResponse;
        expect(profile2.id).toBe(profile1.id); // Same profile ID
        expect(profile2.name).toBe('Updated Name');
        expect(profile2.dateOfBirth).toBe('1995-06-15');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should allow setting name to null', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create initial profile with name
        yield* saveProfile(token, {
          name: 'To Be Removed',
          dateOfBirth: '1990-01-01',
        });

        // Update to remove name
        const { status, json } = yield* saveProfile(token, {
          name: null,
          dateOfBirth: '1990-01-01',
        });

        expect(status).toBe(200);
        const response = json as ProfileResponse;
        expect(response.name).toBeNull();
        expect(response.dateOfBirth).toBe('1990-01-01');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 for invalid dateOfBirth format', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* saveProfile(token, {
          name: 'John Doe',
          dateOfBirth: 'invalid-date',
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for dateOfBirth with invalid month', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* saveProfile(token, {
          dateOfBirth: '1990-13-01', // Invalid month 13
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for empty name string', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* saveProfile(token, {
          name: '',
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for name exceeding 255 characters', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* saveProfile(token, {
          name: 'a'.repeat(256),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PROFILE_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Test Name' }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PROFILE_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token',
          },
          body: JSON.stringify({ name: 'Test Name' }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });
});
