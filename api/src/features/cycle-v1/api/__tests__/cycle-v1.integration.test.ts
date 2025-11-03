import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Schema as S } from 'effect';
import { DatabaseLive } from '../../../../db';
import {
  API_BASE_URL,
  createTestUser,
  deleteTestUser,
  type ErrorResponse,
  generateExpiredToken,
  makeRequest,
  validateJwtSecret,
} from '../../../../test-utils';
import { CycleResponseSchema } from '../schemas';

/**
 * Integration Tests for CycleV1 API
 *
 * Tests using Effect-TS patterns, domain schemas, and shared test utilities:
 * 1. GET /v1/cycles/:id - Get cycle by ID
 * 2. POST /v1/cycles - Create new cycle
 * 3. PATCH /v1/cycles/:id - Update cycle dates
 * 4. POST /v1/cycles/:id/complete - Complete a cycle
 *
 * Security: All tests verify user isolation (users can only access/modify their own cycles)
 */

// ============================================================================
// Test Configuration
// ============================================================================

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/cycles`;
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// Test Data Tracking
// ============================================================================

/**
 * Track test data for cleanup
 * We explicitly track what we create so we only delete test data
 */
const testData = {
  userIds: new Set<string>(),
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
    console.log('\n🧹 Starting CycleV1 test cleanup...');
    console.log(`📊 Tracked test users: ${testData.userIds.size}`);

    if (testData.userIds.size === 0) {
      console.log('⚠️  No test data to clean up');
      return;
    }

    const userIdsArray = Array.from(testData.userIds);

    // Delete users (cycles will be cascade deleted via FK constraints)
    yield* Effect.all(
      userIdsArray.map((userId) => deleteTestUser(userId)),
      { concurrency: 'unbounded' },
    );

    console.log(`✅ Deleted ${testData.userIds.size} test users and their cycles`);
    console.log('✅ CycleV1 test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  CycleV1 test cleanup failed:', error);
        // Don't fail the test suite if cleanup fails
      }),
    ),
  );

  await Effect.runPromise(cleanupProgram);
});

const createTestUserWithTracking = () =>
  Effect.gen(function* () {
    const user = yield* createTestUser();
    testData.userIds.add(user.userId);
    return user;
  });

/**
 * Generate valid cycle dates (2 days ago to 1 day ago)
 */
const generateValidCycleDates = () =>
  Effect.sync(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      startDate: twoDaysAgo.toISOString(),
      endDate: oneDayAgo.toISOString(),
    };
  });

/**
 * Create a cycle for a user
 */
const createCycleForUser = (token: string, dates?: { startDate: string; endDate: string }) =>
  Effect.gen(function* () {
    const cycleDates = dates ?? (yield* generateValidCycleDates());

    const { status, json } = yield* makeRequest(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cycleDates),
    });

    if (status !== 201) {
      throw new Error(`Failed to create cycle: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(CycleResponseSchema)(json);
  });

/**
 * Setup two users for security testing
 * Returns userA with their cycle, and userB who will try to access it
 */
const setupTwoUserSecurityTest = () =>
  Effect.gen(function* () {
    const userA = yield* createTestUserWithTracking();
    const cycleA = yield* createCycleForUser(userA.token);
    const userB = yield* createTestUserWithTracking();

    return { userA, cycleA, userB };
  });

const makeAuthenticatedRequest = (endpoint: string, method: string, token: string, body?: unknown) =>
  Effect.gen(function* () {
    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    return yield* makeRequest(endpoint, options);
  });

// ============================================================================
// Test Helpers - Assertions
// ============================================================================

/**
 * Expect a CycleNotFoundError response
 */
const expectCycleNotFoundError = (status: number, json: unknown, userId: string) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('CycleNotFoundError');
  expect(error.userId).toBe(userId);
};

/**
 * Expect unauthorized response - no token
 */
const expectUnauthorizedNoToken = (endpoint: string, method: string, body?: unknown) =>
  Effect.gen(function* () {
    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const { status } = yield* makeRequest(endpoint, options);
    expect(status).toBe(401);
  });

/**
 * Expect unauthorized response - invalid token
 */
const expectUnauthorizedInvalidToken = (endpoint: string, method: string, body?: unknown) =>
  Effect.gen(function* () {
    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token-12345',
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const { status } = yield* makeRequest(endpoint, options);
    expect(status).toBe(401);
  });

/**
 * Expect unauthorized response - expired token
 */
const expectUnauthorizedExpiredToken = (endpoint: string, method: string, body?: unknown) =>
  Effect.gen(function* () {
    const { userId, email } = yield* createTestUserWithTracking();
    const expiredToken = yield* generateExpiredToken(userId, email, 1);

    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const { status } = yield* makeRequest(endpoint, options);
    expect(status).toBe(401);
  });

/**
 * Expect bad request response - invalid UUID
 */
const expectBadRequestInvalidUUID = (method: string, endpointSuffix = '', body?: unknown) =>
  Effect.gen(function* () {
    const { token } = yield* createTestUserWithTracking();
    const invalidId = 'not-a-valid-uuid';
    const endpoint = endpointSuffix ? `${ENDPOINT}/${invalidId}${endpointSuffix}` : `${ENDPOINT}/${invalidId}`;

    const options: any = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const { status } = yield* makeRequest(endpoint, options);
    expect(status).toBe(400);
  });

/**
 * Expect a valid cycle response with specific fields
 */
const expectValidCycleResponse = (
  json: unknown,
  expectedFields: {
    id?: string;
    userId?: string;
    status?: 'InProgress' | 'Completed';
  },
) =>
  Effect.gen(function* () {
    const cycle = yield* S.decodeUnknown(CycleResponseSchema)(json);

    if (expectedFields.id !== undefined) {
      expect(cycle.id).toBe(expectedFields.id);
    }
    if (expectedFields.userId !== undefined) {
      expect(cycle.userId).toBe(expectedFields.userId);
    }
    if (expectedFields.status !== undefined) {
      expect(cycle.status).toBe(expectedFields.status);
    }

    return cycle;
  });

// ============================================================================
// Tests: GET /v1/cycles/:id
// ============================================================================

describe('GET /v1/cycles/:id - Get Cycle', () => {
  describe('Success Scenarios', () => {
    test('should retrieve an existing cycle with valid ID', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();
        const cycle = yield* createCycleForUser(token);

        const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycle.id}`, 'GET', token);

        expect(status).toBe(200);
        yield* expectValidCycleResponse(json, { id: cycle.id, userId, status: 'InProgress' });
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Security (404)', () => {
    test("should return 404 when user tries to access another user's cycle", async () => {
      const program = Effect.gen(function* () {
        const { cycleA, userB } = yield* setupTwoUserSecurityTest();

        const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycleA.id}`, 'GET', userB.token);

        expectCycleNotFoundError(status, json, userB.userId);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 404 for non-existent cycle ID', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET', token);

        expectCycleNotFoundError(status, json, userId);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no authentication token is provided', async () => {
      const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
      await Effect.runPromise(program);
    });

    test('should return 401 when invalid token is provided', async () => {
      const program = expectUnauthorizedInvalidToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
      await Effect.runPromise(program);
    });

    test('should return 401 when expired token is provided', async () => {
      const program = expectUnauthorizedExpiredToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 for invalid UUID format', async () => {
      const program = expectBadRequestInvalidUUID('GET');
      await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
    });
  });
});

// ============================================================================
// Tests: POST /v1/cycles
// ============================================================================

describe('POST /v1/cycles - Create Cycle', () => {
  describe('Success Scenarios', () => {
    test('should create a new cycle for first-time user', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();
        const dates = yield* generateValidCycleDates();

        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(201);

        const cycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
        expect(cycle.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(cycle.userId).toBe(userId);
        expect(cycle.status).toBe('InProgress');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should create new cycle after previous cycle completed', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create and complete first cycle
        const firstCycle = yield* createCycleForUser(token);
        const completeDates = yield* generateValidCycleDates();

        yield* makeRequest(`${ENDPOINT}/${firstCycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completeDates),
        });

        // Create second cycle
        const secondDates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(secondDates),
        });

        expect(status).toBe(201);

        const secondCycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
        expect(secondCycle.id).not.toBe(firstCycle.id);
        expect(secondCycle.userId).toBe(userId);
        expect(secondCycle.status).toBe('InProgress');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Conflict (409)', () => {
    test('should return 409 when user already has cycle in progress', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create first cycle
        yield* createCycleForUser(token);

        // Try to create second cycle
        const dates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(409);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('CycleAlreadyInProgressError');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no authentication token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when invalid token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token-12345',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when expired token is provided', async () => {
      const program = Effect.gen(function* () {
        const { userId, email } = yield* createTestUserWithTracking();
        const expiredToken = yield* generateExpiredToken(userId, email, 1);
        const dates = yield* generateValidCycleDates();

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expiredToken}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when end date is before start date', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: oneDayAgo.toISOString(),
          endDate: twoDaysAgo.toISOString(), // End before start
        };

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when duration is less than 1 hour', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const now = new Date();
        const startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
        const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes later

        const invalidDates = {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        };

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when start date is in future', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: tomorrow.toISOString(),
          endDate: dayAfterTomorrow.toISOString(),
        };

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when end date is in future', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: yesterday.toISOString(),
          endDate: tomorrow.toISOString(),
        };

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when required fields are missing', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when date format is invalid', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const invalidDates = {
          startDate: 'not-a-date',
          endDate: 'also-not-a-date',
        };

        const { status } = yield* makeRequest(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// Tests: PATCH /v1/cycles/:id
// ============================================================================

describe('PATCH /v1/cycles/:id - Update Cycle Dates', () => {
  describe('Success Scenarios', () => {
    test('should update dates for in-progress cycle', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create a cycle
        const cycle = yield* createCycleForUser(token);

        // Update dates
        const newDates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycle.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newDates),
        });

        expect(status).toBe(200);

        const updatedCycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
        expect(updatedCycle.id).toBe(cycle.id);
        expect(updatedCycle.userId).toBe(userId);
        expect(updatedCycle.status).toBe('InProgress');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Security (404)', () => {
    test("should return 404 when user tries to update another user's cycle", async () => {
      const program = Effect.gen(function* () {
        // User A creates a cycle
        const userA = yield* createTestUserWithTracking();
        const cycleA = yield* createCycleForUser(userA.token);

        // User B tries to update User A's cycle
        const userB = yield* createTestUserWithTracking();
        const dates = yield* generateValidCycleDates();

        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycleA.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userB.token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(404);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('CycleNotFoundError');
        expect(error.userId).toBe(userB.userId);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test('should return 404 when trying to update a completed cycle (no active cycle)', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create and complete a cycle
        const cycle = yield* createCycleForUser(token);
        const completeDates = yield* generateValidCycleDates();

        yield* makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completeDates),
        });

        // Try to update the completed cycle (should fail because no active cycle exists)
        const newDates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycle.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newDates),
        });

        expect(status).toBe(404);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('CycleNotFoundError');
        expect(error.userId).toBe(userId);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 409 when trying to update cycle that is not the active cycle', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create and complete first cycle
        const firstCycle = yield* createCycleForUser(token);
        const completeDates = yield* generateValidCycleDates();

        yield* makeRequest(`${ENDPOINT}/${firstCycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completeDates),
        });

        // Create second cycle (now active)
        const secondCycle = yield* createCycleForUser(token);

        // Try to update the first (completed) cycle while second is active
        const newDates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(`${ENDPOINT}/${firstCycle.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newDates),
        });

        expect(status).toBe(409);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('CycleIdMismatchError');
        expect(error.requestedCycleId).toBe(firstCycle.id);
        expect(error.activeCycleId).toBe(secondCycle.id);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no authentication token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when invalid token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token-12345',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when expired token is provided', async () => {
      const program = Effect.gen(function* () {
        const { userId, email } = yield* createTestUserWithTracking();
        const expiredToken = yield* generateExpiredToken(userId, email, 1);
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expiredToken}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when end date is before start date', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const cycle = yield* createCycleForUser(token);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: oneDayAgo.toISOString(),
          endDate: twoDaysAgo.toISOString(),
        };

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycle.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when dates are in future', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const cycle = yield* createCycleForUser(token);

        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: tomorrow.toISOString(),
          endDate: dayAfterTomorrow.toISOString(),
        };

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycle.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 for invalid UUID format', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const dates = yield* generateValidCycleDates();
        const invalidId = 'not-a-valid-uuid';

        const { status } = yield* makeRequest(`${ENDPOINT}/${invalidId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });
});

// ============================================================================
// Tests: POST /v1/cycles/:id/complete
// ============================================================================

describe('POST /v1/cycles/:id/complete - Complete Cycle', () => {
  describe('Success Scenarios', () => {
    test('should complete an in-progress cycle', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create a cycle
        const cycle = yield* createCycleForUser(token);

        // Complete it
        const completeDates = yield* generateValidCycleDates();
        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completeDates),
        });

        expect(status).toBe(200);

        const completedCycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
        expect(completedCycle.id).toBe(cycle.id);
        expect(completedCycle.userId).toBe(userId);
        expect(completedCycle.status).toBe('Completed');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should update cycle dates when completing', async () => {
      const program = Effect.gen(function* () {
        const { userId, token } = yield* createTestUserWithTracking();

        // Create a cycle with specific dates
        const createDates = yield* generateValidCycleDates();
        const cycle = yield* createCycleForUser(token, createDates);

        // Complete it with different dates
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const completeDates = {
          startDate: threeDaysAgo.toISOString(),
          endDate: oneDayAgo.toISOString(),
        };

        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(completeDates),
        });

        expect(status).toBe(200);

        const completedCycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
        expect(completedCycle.id).toBe(cycle.id);
        expect(completedCycle.userId).toBe(userId);
        expect(completedCycle.status).toBe('Completed');
        // Dates should be updated (PostgreSQL truncates milliseconds, so compare in seconds)
        expect(Math.floor(new Date(completedCycle.startDate).getTime() / 1000)).toBe(
          Math.floor(threeDaysAgo.getTime() / 1000),
        );
        expect(Math.floor(new Date(completedCycle.endDate).getTime() / 1000)).toBe(
          Math.floor(oneDayAgo.getTime() / 1000),
        );
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Security (404)', () => {
    test("should return 404 when user tries to complete another user's cycle", async () => {
      const program = Effect.gen(function* () {
        // User A creates a cycle
        const userA = yield* createTestUserWithTracking();
        const cycleA = yield* createCycleForUser(userA.token);

        // User B tries to complete User A's cycle
        const userB = yield* createTestUserWithTracking();
        const dates = yield* generateValidCycleDates();

        const { status, json } = yield* makeRequest(`${ENDPOINT}/${cycleA.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userB.token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(404);

        const error = json as ErrorResponse;
        expect(error._tag).toBe('CycleNotFoundError');
        expect(error.userId).toBe(userB.userId);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test('should return 401 when no authentication token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when invalid token is provided', async () => {
      const program = Effect.gen(function* () {
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token-12345',
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      });

      await Effect.runPromise(program);
    });

    test('should return 401 when expired token is provided', async () => {
      const program = Effect.gen(function* () {
        const { userId, email } = yield* createTestUserWithTracking();
        const expiredToken = yield* generateExpiredToken(userId, email, 1);
        const dates = yield* generateValidCycleDates();
        const cycleId = '00000000-0000-0000-0000-000000000000';

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycleId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expiredToken}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(401);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });

  describe('Error Scenarios - Validation (400)', () => {
    test('should return 400 when end date is before start date', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const cycle = yield* createCycleForUser(token);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: oneDayAgo.toISOString(),
          endDate: twoDaysAgo.toISOString(),
        };

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 when dates are in future', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const cycle = yield* createCycleForUser(token);

        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

        const invalidDates = {
          startDate: tomorrow.toISOString(),
          endDate: dayAfterTomorrow.toISOString(),
        };

        const { status } = yield* makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(invalidDates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });

    test('should return 400 for invalid UUID format', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const dates = yield* generateValidCycleDates();
        const invalidId = 'not-a-valid-uuid';

        const { status } = yield* makeRequest(`${ENDPOINT}/${invalidId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dates),
        });

        expect(status).toBe(400);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    });
  });
});
