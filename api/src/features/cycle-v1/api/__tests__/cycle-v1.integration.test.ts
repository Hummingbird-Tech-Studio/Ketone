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

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/cycles`;
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  const cleanupProgram = Effect.gen(function* () {
    console.log('\n🧹 Starting CycleV1 test cleanup...');
    console.log(`📊 Tracked test users: ${testData.userIds.size}`);

    if (testData.userIds.size === 0) {
      console.log('⚠️  No test data to clean up');
      return;
    }

    const userIdsArray = Array.from(testData.userIds);

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

const generateInvalidDatesEndBeforeStart = () =>
  Effect.sync(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return {
      startDate: oneDayAgo.toISOString(),
      endDate: twoDaysAgo.toISOString(),
    };
  });

const generateFutureDates = () =>
  Effect.sync(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    return {
      startDate: tomorrow.toISOString(),
      endDate: dayAfterTomorrow.toISOString(),
    };
  });

const generateShortDurationDates = (durationMinutes = 30) =>
  Effect.sync(() => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  });

const generatePastDates = (daysAgoStart: number, daysAgoEnd: number) =>
  Effect.sync(() => {
    const now = new Date();
    const startDate = new Date(now.getTime() - daysAgoStart * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - daysAgoEnd * 24 * 60 * 60 * 1000);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  });

const generateDatesWithFutureEndDate = () =>
  Effect.sync(() => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      startDate: yesterday.toISOString(),
      endDate: tomorrow.toISOString(),
    };
  });

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

const expectCycleNotFoundError = (status: number, json: unknown, userId: string) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('CycleNotFoundError');
  expect(error.userId).toBe(userId);
};

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

describe('GET /v1/cycles/:id - Get Cycle', () => {
  describe('Success Scenarios', () => {
    test(
      'should retrieve an existing cycle with valid ID',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycle.id}`, 'GET', token);

          expect(status).toBe(200);
          yield* expectValidCycleResponse(json, { id: cycle.id, userId, status: 'InProgress' });
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Security (404)', () => {
    test(
      "should return 404 when user tries to access another user's cycle",
      async () => {
        const program = Effect.gen(function* () {
          const { cycleA, userB } = yield* setupTwoUserSecurityTest();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycleA.id}`, 'GET', userB.token);

          expectCycleNotFoundError(status, json, userB.userId);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 404 for non-existent cycle ID',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET', token);

          expectCycleNotFoundError(status, json, userId);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test(
      'should return 401 when no authentication token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
        const program = expectUnauthorizedInvalidToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
        const program = expectUnauthorizedExpiredToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400)', () => {
    test(
      'should return 400 for invalid UUID format',
      async () => {
        const program = expectBadRequestInvalidUUID('GET');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

describe('POST /v1/cycles - Create Cycle', () => {
  describe('Success Scenarios', () => {
    test(
      'should create a new cycle for first-time user',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should create new cycle after previous cycle completed',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Conflict (409)', () => {
    test(
      'should return 409 when user already has cycle in progress',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          yield* createCycleForUser(token);

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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test(
      'should return 401 when no authentication token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400)', () => {
    test(
      'should return 400 when end date is before start date',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const invalidDates = yield* generateInvalidDatesEndBeforeStart();

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      {
        timeout: 15000,
      },
    );

    test(
      'should return 400 when duration is less than 1 hour',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const invalidDates = yield* generateShortDurationDates(30);

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when start date is in future',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const invalidDates = yield* generateFutureDates();

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when end date is in future',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const invalidDates = yield* generateDatesWithFutureEndDate();

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when required fields are missing',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when date format is invalid',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });
});

describe('PATCH /v1/cycles/:id - Update Cycle Dates', () => {
  describe('Success Scenarios', () => {
    test(
      'should update dates for in-progress cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Security (404)', () => {
    test(
      "should return 404 when user tries to update another user's cycle",
      async () => {
        const program = Effect.gen(function* () {
          const userA = yield* createTestUserWithTracking();
          const cycleA = yield* createCycleForUser(userA.token);

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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when trying to update a completed cycle (no active cycle)',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

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
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when trying to update cycle that is not the active cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
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

          const secondCycle = yield* createCycleForUser(token);
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test(
      'should return 401 when no authentication token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400)', () => {
    test(
      'should return 400 when end date is before start date',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const invalidDates = yield* generateInvalidDatesEndBeforeStart();

          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycle.id}`, 'PATCH', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when dates are in future',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const invalidDates = yield* generateFutureDates();

          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${cycle.id}`, 'PATCH', token, invalidDates);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 for invalid UUID format',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });
});

describe('POST /v1/cycles/:id/complete - Complete Cycle', () => {
  describe('Success Scenarios', () => {
    test(
      'should complete an in-progress cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
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
      },
      { timeout: 15000 },
    );

    test(
      'should update cycle dates when completing',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const createDates = yield* generateValidCycleDates();
          const cycle = yield* createCycleForUser(token, createDates);
          const completeDates = yield* generatePastDates(3, 1);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            completeDates,
          );

          expect(status).toBe(200);

          const completedCycle = yield* S.decodeUnknown(CycleResponseSchema)(json);
          expect(completedCycle.id).toBe(cycle.id);
          expect(completedCycle.userId).toBe(userId);
          expect(completedCycle.status).toBe('Completed');
          expect(completedCycle.startDate).toBeDefined();
          expect(completedCycle.endDate).toBeDefined();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Security (404)', () => {
    test(
      "should return 404 when user tries to complete another user's cycle",
      async () => {
        const program = Effect.gen(function* () {
          const userA = yield* createTestUserWithTracking();
          const cycleA = yield* createCycleForUser(userA.token);
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Unauthorized (401)', () => {
    test(
      'should return 401 when no authentication token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400)', () => {
    test(
      'should return 400 when end date is before start date',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const invalidDates = yield* generateInvalidDatesEndBeforeStart();

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            invalidDates,
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when dates are in future',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const invalidDates = yield* generateFutureDates();

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            invalidDates,
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 for invalid UUID format',
      async () => {
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
      },
      { timeout: 15000 },
    );
  });
});

describe('Race Conditions & Concurrency', () => {
  describe('Concurrent createCycle', () => {
    test(
      'should handle concurrent cycle creation - only one succeeds, other fails with 409',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const dates = yield* generateValidCycleDates();

          // Fire two concurrent create requests
          const [result1, result2] = yield* Effect.all(
            [
              makeRequest(ENDPOINT, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(dates),
              }),
              makeRequest(ENDPOINT, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(dates),
              }),
            ],
            { concurrency: 'unbounded' },
          );

          // One should succeed (201), one should fail (409)
          const results = [result1, result2];
          const successResults = results.filter((r) => r.status === 201);
          const failureResults = results.filter((r) => r.status === 409);

          expect(successResults.length).toBe(1);
          expect(failureResults.length).toBe(1);

          // Verify the failure has the correct error type
          const failedResult = failureResults[0];
          expect(failedResult).toBeDefined();
          const error = failedResult!.json as ErrorResponse;
          expect(error._tag).toBe('CycleAlreadyInProgressError');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Concurrent completeCycle', () => {
    test(
      'should handle concurrent cycle completion - only first succeeds, second fails with 409',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const completeDates = yield* generateValidCycleDates();

          // Fire two concurrent complete requests
          const [result1, result2] = yield* Effect.all(
            [
              makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(completeDates),
              }),
              makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(completeDates),
              }),
            ],
            { concurrency: 'unbounded' },
          );

          // One should succeed (200), one should fail (409 or 200 if idempotent)
          const results = [result1, result2];
          const successResults = results.filter((r) => r.status === 200);

          // Both could succeed due to idempotency check in service
          // Or one succeeds and one fails with 409
          if (successResults.length === 2) {
            // Idempotent behavior - both return same cycle
            expect(successResults[0]).toBeDefined();
            expect(successResults[1]).toBeDefined();
            const cycle1 = successResults[0]!.json as any;
            const cycle2 = successResults[1]!.json as any;
            expect(cycle1.id).toBe(cycle2.id);
            expect(cycle1.status).toBe('Completed');
            expect(cycle2.status).toBe('Completed');
          } else {
            // Status guard behavior - one succeeds, one fails
            expect(successResults.length).toBe(1);
            const failureResults = results.filter((r) => r.status === 409);
            expect(failureResults.length).toBe(1);

            const failedResult = failureResults[0];
            expect(failedResult).toBeDefined();
            const error = failedResult!.json as ErrorResponse;
            expect(error._tag).toBe('CycleInvalidStateError');
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Cross-Operation Race Conditions', () => {
    test(
      'should handle concurrent update and complete - complete succeeds, update fails',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const updateDates = yield* generateValidCycleDates();
          const completeDates = yield* generateValidCycleDates();

          // Fire concurrent update and complete requests
          const [updateResult, completeResult] = yield* Effect.all(
            [
              makeRequest(`${ENDPOINT}/${cycle.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(updateDates),
              }),
              makeRequest(`${ENDPOINT}/${cycle.id}/complete`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(completeDates),
              }),
            ],
            { concurrency: 'unbounded' },
          );

          // Complete should always succeed
          expect(completeResult.status).toBe(200);
          const completedCycle = completeResult.json as any;
          expect(completedCycle.status).toBe('Completed');

          // Update can succeed or fail depending on timing (legitimate race condition)
          expect([200, 404, 409]).toContain(updateResult.status);

          if (updateResult.status === 200) {
            // Scenario: Update won the race, both succeeded
            const updatedCycle = updateResult.json as any;
            expect(updatedCycle.status).toBe('InProgress');
            // Complete then finished it afterward
          } else if (updateResult.status === 404) {
            // Scenario: Complete won the race, update found no active cycle
            const error = updateResult.json as ErrorResponse;
            expect(error._tag).toBe('CycleNotFoundError');
          } else {
            // Scenario: Update tried after complete, got invalid state
            const error = updateResult.json as ErrorResponse;
            expect(error._tag).toBe('CycleInvalidStateError');
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Status Guard Enforcement', () => {
    test(
      'should fail to update an already completed cycle with 404',
      async () => {
        const program = Effect.gen(function* () {
          const { token, userId } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const completeDates = yield* generateValidCycleDates();

          // Complete the cycle first
          const { status: completeStatus } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            completeDates,
          );
          expect(completeStatus).toBe(200);

          // Try to update the completed cycle
          const updateDates = yield* generateValidCycleDates();
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}`,
            'PATCH',
            token,
            updateDates,
          );

          // Should fail with 404 (no active cycle found)
          expectCycleNotFoundError(status, json, userId);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should handle completing an already completed cycle idempotently',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const cycle = yield* createCycleForUser(token);
          const completeDates = yield* generateValidCycleDates();

          // Complete the cycle first time
          const { status: firstStatus, json: firstJson } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            completeDates,
          );
          expect(firstStatus).toBe(200);
          const firstCycle = firstJson as any;
          expect(firstCycle.status).toBe('Completed');

          // Try to complete again with same data
          const { status: secondStatus, json: secondJson } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${cycle.id}/complete`,
            'POST',
            token,
            completeDates,
          );

          // Should succeed idempotently (200) and return the same completed cycle
          expect(secondStatus).toBe(200);
          const secondCycle = secondJson as any;
          expect(secondCycle.id).toBe(firstCycle.id);
          expect(secondCycle.status).toBe('Completed');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Multi-User Concurrent Operations', () => {
    test(
      'should handle concurrent operations across multiple users correctly',
      async () => {
        const program = Effect.gen(function* () {
          // Create 3 users
          const userA = yield* createTestUserWithTracking();
          const userB = yield* createTestUserWithTracking();
          const userC = yield* createTestUserWithTracking();

          const dates = yield* generateValidCycleDates();

          // User A: Two concurrent creates (2nd should fail)
          const [userAResult1, userAResult2] = yield* Effect.all(
            [
              makeRequest(ENDPOINT, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${userA.token}`,
                },
                body: JSON.stringify(dates),
              }),
              makeRequest(ENDPOINT, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${userA.token}`,
                },
                body: JSON.stringify(dates),
              }),
            ],
            { concurrency: 'unbounded' },
          );

          // User B: Create then update (both should succeed)
          const userBCycle = yield* createCycleForUser(userB.token);
          const updateDates = yield* generateValidCycleDates();
          const userBUpdateResult = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${userBCycle.id}`,
            'PATCH',
            userB.token,
            updateDates,
          );

          // User C: Create then complete (both should succeed)
          const userCCycle = yield* createCycleForUser(userC.token);
          const completeDates = yield* generateValidCycleDates();
          const userCCompleteResult = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${userCCycle.id}/complete`,
            'POST',
            userC.token,
            completeDates,
          );

          // Verify User A: One create succeeds, one fails
          const userAResults = [userAResult1, userAResult2];
          const userASuccesses = userAResults.filter((r) => r.status === 201);
          const userAFailures = userAResults.filter((r) => r.status === 409);

          expect(userASuccesses.length).toBe(1);
          expect(userAFailures.length).toBe(1);

          // Verify User B: Update succeeded
          expect(userBUpdateResult.status).toBe(200);
          const updatedCycle = userBUpdateResult.json as any;
          expect(updatedCycle.status).toBe('InProgress');

          // Verify User C: Complete succeeded
          expect(userCCompleteResult.status).toBe(200);
          const completedCycle = userCCompleteResult.json as any;
          expect(completedCycle.status).toBe('Completed');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      {
        timeout: 15000,
      },
    );
  });
});
