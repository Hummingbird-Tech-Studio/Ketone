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
import { ProfileResponseSchema, PhysicalInfoResponseSchema } from '../schemas';

validateJwtSecret();

const PROFILE_ENDPOINT = `${API_BASE_URL}/v1/profile`;
const PHYSICAL_INFO_ENDPOINT = `${API_BASE_URL}/v1/profile/physical`;

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
type PhysicalInfoResponse = S.Schema.Encoded<typeof PhysicalInfoResponseSchema>;

const getProfile = (token: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(PROFILE_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return { status, json: json as ProfileResponse | null | ErrorResponse };
  });

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

type PhysicalInfoPayload = {
  weight?: number | null;
  height?: number | null;
  gender?: 'Male' | 'Female' | 'Prefer not to say' | null;
  weightUnit?: 'kg' | 'lbs' | null;
  heightUnit?: 'cm' | 'ft_in' | null;
};

const getPhysicalInfo = (token: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return { status, json: json as PhysicalInfoResponse | null | ErrorResponse };
  });

const savePhysicalInfo = (token: string, data: PhysicalInfoPayload) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    return { status, json: json as PhysicalInfoResponse | ErrorResponse };
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

describe('GET /v1/profile - Get Profile', () => {
  describe('Success Scenarios', () => {
    test('should return null when profile does not exist', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* getProfile(token);

        expect(status).toBe(200);
        expect(json).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return existing profile', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create profile first
        yield* saveProfile(token, {
          name: 'John Doe',
          dateOfBirth: '1990-05-15',
        });

        // Get profile
        const { status, json } = yield* getProfile(token);

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

    test('should return profile with null fields when saved with empty data', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create profile with empty data
        yield* saveProfile(token, {});

        // Get profile
        const { status, json } = yield* getProfile(token);

        expect(status).toBe(200);

        const response = json as ProfileResponse;
        expect(response.name).toBeNull();
        expect(response.dateOfBirth).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PROFILE_ENDPOINT, {
          method: 'GET',
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
          method: 'GET',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });
});

describe('PUT /v1/profile/physical - Save Physical Info', () => {
  describe('Success Scenarios', () => {
    test('should create physical info with all fields', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* savePhysicalInfo(token, {
          weight: 75.5,
          height: 175,
          gender: 'Male',
          weightUnit: 'kg',
          heightUnit: 'cm',
        });

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBe(75.5);
        expect(response.height).toBe(175);
        expect(response.gender).toBe('Male');
        expect(response.weightUnit).toBe('kg');
        expect(response.heightUnit).toBe('cm');
        expect(response.age).toBeNull(); // No dateOfBirth set
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should create physical info with partial data', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* savePhysicalInfo(token, {
          weight: 80,
          weightUnit: 'kg',
        });

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBe(80);
        expect(response.height).toBeNull();
        expect(response.gender).toBeNull();
        expect(response.weightUnit).toBe('kg');
        expect(response.heightUnit).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should update existing physical info', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create initial physical info
        yield* savePhysicalInfo(token, {
          weight: 70,
          height: 170,
          gender: 'Male',
        });

        // Update physical info
        const { status, json } = yield* savePhysicalInfo(token, {
          weight: 75,
          height: 172,
          gender: 'Female',
        });

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBe(75);
        expect(response.height).toBe(172);
        expect(response.gender).toBe('Female');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should allow setting fields to null', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create initial physical info
        yield* savePhysicalInfo(token, {
          weight: 70,
          height: 170,
          gender: 'Male',
        });

        // Set weight to null
        const { status, json } = yield* savePhysicalInfo(token, {
          weight: null,
          height: 170,
          gender: 'Male',
        });

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBeNull();
        expect(response.height).toBe(170);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should calculate age from dateOfBirth when profile has dateOfBirth', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create profile with dateOfBirth
        const birthYear = new Date().getFullYear() - 30;
        yield* saveProfile(token, {
          name: 'Test User',
          dateOfBirth: `${birthYear}-01-01`,
        });

        // Save physical info
        const { status, json } = yield* savePhysicalInfo(token, {
          weight: 70,
          height: 170,
        });

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        // Age should be around 30 (could be 29 or 30 depending on current date)
        expect(response.age).toBeGreaterThanOrEqual(29);
        expect(response.age).toBeLessThanOrEqual(30);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should accept all valid gender values', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Test 'Male'
        let result = yield* savePhysicalInfo(token, { gender: 'Male' });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).gender).toBe('Male');

        // Test 'Female'
        result = yield* savePhysicalInfo(token, { gender: 'Female' });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).gender).toBe('Female');

        // Test 'Prefer not to say'
        result = yield* savePhysicalInfo(token, { gender: 'Prefer not to say' });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).gender).toBe('Prefer not to say');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 for weight below minimum (30 kg)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* savePhysicalInfo(token, {
          weight: 29.9,
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for weight above maximum (300 kg)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* savePhysicalInfo(token, {
          weight: 300.1,
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for height below minimum (120 cm)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* savePhysicalInfo(token, {
          height: 119.9,
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for height above maximum (250 cm)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* savePhysicalInfo(token, {
          height: 250.1,
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for invalid gender value', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ gender: 'InvalidGender' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for invalid weightUnit value', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ weightUnit: 'pounds' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return 400 for invalid heightUnit value', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ heightUnit: 'inches' }),
        });

        expect(status).toBe(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should accept boundary values for weight (30 and 300)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Test minimum weight
        let result = yield* savePhysicalInfo(token, { weight: 30 });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).weight).toBe(30);

        // Test maximum weight
        result = yield* savePhysicalInfo(token, { weight: 300 });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).weight).toBe(300);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should accept boundary values for height (120 and 250)', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Test minimum height
        let result = yield* savePhysicalInfo(token, { height: 120 });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).height).toBe(120);

        // Test maximum height
        result = yield* savePhysicalInfo(token, { height: 250 });
        expect(result.status).toBe(200);
        expect((result.json as PhysicalInfoResponse).height).toBe(250);
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ weight: 70 }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token',
          },
          body: JSON.stringify({ weight: 70 }),
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });
});

describe('GET /v1/profile/physical - Get Physical Info', () => {
  describe('Success Scenarios', () => {
    test('should return null when profile does not exist', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* getPhysicalInfo(token);

        expect(status).toBe(200);
        expect(json).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return existing physical info', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create physical info first
        yield* savePhysicalInfo(token, {
          weight: 75.5,
          height: 175,
          gender: 'Male',
          weightUnit: 'kg',
          heightUnit: 'cm',
        });

        // Get physical info
        const { status, json } = yield* getPhysicalInfo(token);

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBe(75.5);
        expect(response.height).toBe(175);
        expect(response.gender).toBe('Male');
        expect(response.weightUnit).toBe('kg');
        expect(response.heightUnit).toBe('cm');
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });

    test('should return physical info with null fields when saved with empty data', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create physical info with empty data
        yield* savePhysicalInfo(token, {});

        // Get physical info
        const { status, json } = yield* getPhysicalInfo(token);

        expect(status).toBe(200);

        const response = json as PhysicalInfoResponse;
        expect(response.weight).toBeNull();
        expect(response.height).toBeNull();
        expect(response.gender).toBeNull();
        expect(response.weightUnit).toBeNull();
        expect(response.heightUnit).toBeNull();
      });

      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive), Effect.scoped));
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no auth token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'GET',
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when token is invalid', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(PHYSICAL_INFO_ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer invalid-token',
          },
        });

        expect(status).toBe(401);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('UnauthorizedError');
      });

      await Effect.runPromise(program);
    });
  });
});
