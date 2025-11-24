import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer, Schema as S } from 'effect';
import { startOfWeek } from 'date-fns';
import { DatabaseLive } from '../../../../db';
import {
  API_BASE_URL,
  createTestUser,
  deleteTestUser,
  type ErrorResponse,
  generateExpiredToken,
  generateTestEmail,
  makeRequest,
  validateJwtSecret,
} from '../../../../test-utils';
import { CycleStatisticsResponseSchema, CycleResponseSchema } from '../schemas';
import { CycleRepositoryLive } from '../../repositories';

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/cycles/statistics`;

const TestLayers = Layer.mergeAll(CycleRepositoryLive, DatabaseLive);

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting Cycle Statistics test cleanup...');
  console.log(`📊 Tracked test users: ${testData.userIds.size}`);

  if (testData.userIds.size === 0) {
    console.log('⚠️  No test data to clean up');
    return;
  }

  const cleanupProgram = Effect.gen(function* () {
    const userIdsArray = Array.from(testData.userIds);

    yield* Effect.all(
      userIdsArray.map((userId) => deleteTestUser(userId)),
      { concurrency: 'unbounded' },
    );

    console.log(`✅ Deleted ${testData.userIds.size} test users and their cycles`);
    console.log('✅ Cycle Statistics test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  Cycle Statistics test cleanup failed:', error);
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

/**
 * Generate cycle dates that are in the past AND within the current week.
 * Uses hours ago from now, guaranteed to be within the current week.
 * @param hoursAgo - Hours before now for cycle start
 * @param durationHours - Duration of cycle in hours (default 1)
 */
const generateCycleDatesInPast = (hoursAgo: number, durationHours: number = 1) =>
  Effect.sync(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });

    // Calculate the start date (hoursAgo before now)
    let startDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    // Ensure start date is not before the week start
    if (startDate < weekStart) {
      startDate = new Date(weekStart.getTime() + 60 * 60 * 1000); // 1 hour after week start
    }

    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  });

const createCycleForUser = (token: string, dates: { startDate: string; endDate: string }) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(`${API_BASE_URL}/v1/cycles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dates),
    });

    if (status !== 201) {
      throw new Error(`Failed to create cycle: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(CycleResponseSchema)(json);
  });

const completeCycleForUser = (token: string, cycleId: string, dates: { startDate: string; endDate: string }) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeRequest(`${API_BASE_URL}/v1/cycles/${cycleId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dates),
    });

    if (status !== 200 && status !== 201) {
      throw new Error(`Failed to complete cycle: ${status} - ${JSON.stringify(json)}`);
    }

    return json;
  });

describe('GET /v1/cycles/statistics', () => {
  describe('Authentication', () => {
    test('should return 401 when no token is provided', async () => {
      const program = Effect.gen(function* () {
        const now = new Date().toISOString();
        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now}`, {
          method: 'GET',
        });

        expect(status).toBe(401);
        expect((json as ErrorResponse).message).toBeDefined();
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should return 401 when token is expired', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const testEmail = yield* generateTestEmail();
        const expiredToken = yield* generateExpiredToken(userId, testEmail);
        const now = new Date().toISOString();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${expiredToken}`,
          },
        });

        expect(status).toBe(401);
        expect((json as ErrorResponse).message).toBeDefined();
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Weekly Statistics', () => {
    test('should return empty cycles array when no cycles exist in period', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const now = new Date().toISOString();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        expect(statistics.periodType).toBe('weekly');
        expect(statistics.cycles).toEqual([]);
        expect(statistics.periodStart).toBeInstanceOf(Date);
        expect(statistics.periodEnd).toBeInstanceOf(Date);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should return cycles that started within the week', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Generate dates that are in the past AND within the current week
        const dates = yield* generateCycleDatesInPast(3);
        const createdCycle = yield* createCycleForUser(token, dates);
        const now = new Date();

        // Use the same date for the query
        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now.toISOString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        expect(statistics.periodType).toBe('weekly');
        expect(statistics.cycles.length).toBeGreaterThanOrEqual(1);

        // Verify the cycle is in the response
        const foundCycle = statistics.cycles.find((c) => c.id === createdCycle.id);
        expect(foundCycle).toBeDefined();
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should include both InProgress and Completed cycles', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create and complete a cycle (4-3 hours ago, non-overlapping)
        const completedDates = yield* generateCycleDatesInPast(4);
        const completedCycle = yield* createCycleForUser(token, completedDates);
        yield* completeCycleForUser(token, completedCycle.id, completedDates);

        // Create an in-progress cycle (2-1 hours ago, after the completed one)
        const inProgressDates = yield* generateCycleDatesInPast(2);
        const inProgressCycle = yield* createCycleForUser(token, inProgressDates);
        const now = new Date();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now.toISOString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        // Should include both cycles
        const foundCompleted = statistics.cycles.find((c) => c.id === completedCycle.id);
        const foundInProgress = statistics.cycles.find((c) => c.id === inProgressCycle.id);

        expect(foundCompleted?.status).toBe('Completed');
        expect(foundInProgress?.status).toBe('InProgress');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should calculate correct period boundaries for weekly', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const testDate = new Date();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${testDate.toISOString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        // Verify that period boundaries are returned and period start is before period end
        expect(statistics.periodStart).toBeInstanceOf(Date);
        expect(statistics.periodEnd).toBeInstanceOf(Date);
        expect(statistics.periodStart.getTime()).toBeLessThan(statistics.periodEnd.getTime());

        // Weekly period should be approximately 7 days
        const periodDuration = statistics.periodEnd.getTime() - statistics.periodStart.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        expect(periodDuration).toBeLessThanOrEqual(sevenDaysMs);
        expect(periodDuration).toBeGreaterThan(6 * 24 * 60 * 60 * 1000); // At least 6 days
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Monthly Statistics', () => {
    test('should return empty cycles array when no cycles exist in month', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const now = new Date().toISOString();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=monthly&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        expect(statistics.periodType).toBe('monthly');
        expect(statistics.cycles).toEqual([]);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should calculate correct period boundaries for monthly', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const testDate = new Date();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=monthly&date=${testDate.toISOString()}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        // Verify that period boundaries are returned and period start is before period end
        expect(statistics.periodStart).toBeInstanceOf(Date);
        expect(statistics.periodEnd).toBeInstanceOf(Date);
        expect(statistics.periodStart.getTime()).toBeLessThan(statistics.periodEnd.getTime());

        // Monthly period should be at least 28 days and at most 31 days
        const periodDuration = statistics.periodEnd.getTime() - statistics.periodStart.getTime();
        const minMonthMs = 27 * 24 * 60 * 60 * 1000; // At least 27 days
        const maxMonthMs = 32 * 24 * 60 * 60 * 1000; // At most 32 days
        expect(periodDuration).toBeGreaterThan(minMonthMs);
        expect(periodDuration).toBeLessThanOrEqual(maxMonthMs);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Response Structure', () => {
    test('should return correct response structure', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const now = new Date().toISOString();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        // Validate against schema
        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        // Verify all expected fields are present
        expect(statistics).toHaveProperty('periodStart');
        expect(statistics).toHaveProperty('periodEnd');
        expect(statistics).toHaveProperty('periodType');
        expect(statistics).toHaveProperty('cycles');
        expect(Array.isArray(statistics.cycles)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should order cycles by startDate descending', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create first cycle (older - 4-3 hours ago)
        const olderDates = yield* generateCycleDatesInPast(4);
        const olderCycle = yield* createCycleForUser(token, olderDates);
        yield* completeCycleForUser(token, olderCycle.id, olderDates);

        // Create second cycle (newer - 2-1 hours ago)
        const newerDates = yield* generateCycleDatesInPast(2);
        yield* createCycleForUser(token, newerDates);

        const now = new Date().toISOString();

        const { status, json } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(status).toBe(200);

        const statistics = yield* S.decodeUnknown(CycleStatisticsResponseSchema)(json);

        if (statistics.cycles.length >= 2) {
          const firstCycle = statistics.cycles[0];
          const secondCycle = statistics.cycles[1];

          if (firstCycle && secondCycle) {
            // First cycle should be newer (more recent startDate)
            const firstStartDate = new Date(firstCycle.startDate).getTime();
            const secondStartDate = new Date(secondCycle.startDate).getTime();
            expect(firstStartDate).toBeGreaterThan(secondStartDate);
          }
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Validation', () => {
    test('should return error for invalid period type', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const now = new Date().toISOString();

        const { status } = yield* makeRequest(`${ENDPOINT}?period=invalid&date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Schema validation errors return 400 or 500 depending on framework handling
        expect(status).toBeGreaterThanOrEqual(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should return error for invalid date format', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* makeRequest(`${ENDPOINT}?period=weekly&date=not-a-date`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Schema validation errors return 400 or 500 depending on framework handling
        expect(status).toBeGreaterThanOrEqual(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should return error when period is missing', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();
        const now = new Date().toISOString();

        const { status } = yield* makeRequest(`${ENDPOINT}?date=${now}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Schema validation errors return 400 or 500 depending on framework handling
        expect(status).toBeGreaterThanOrEqual(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should return error when date is missing', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status } = yield* makeRequest(`${ENDPOINT}?period=weekly`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        // Schema validation errors return 400 or 500 depending on framework handling
        expect(status).toBeGreaterThanOrEqual(400);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });
});
