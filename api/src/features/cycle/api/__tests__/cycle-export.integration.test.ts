import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer } from 'effect';
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
import { CycleRepositoryLive } from '../../repositories';

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/cycles/export`;

const TestLayers = Layer.mergeAll(CycleRepositoryLive, DatabaseLive);

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting Cycle Export test cleanup...');
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
    console.log('✅ Cycle Export test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  Cycle Export test cleanup failed:', error);
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
 */
const generateCycleDatesInPast = (hoursAgo: number, durationHours: number = 1) =>
  Effect.sync(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });

    let startDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

    if (startDate < weekStart) {
      startDate = new Date(weekStart.getTime() + 60 * 60 * 1000);
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

    return json as { id: string; status: string };
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

describe('GET /v1/cycles/export', () => {
  describe('Authentication', () => {
    test('should return 401 when no token is provided', async () => {
      const program = Effect.gen(function* () {
        const { status, json } = yield* makeRequest(ENDPOINT, {
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

        const { status, json } = yield* makeRequest(ENDPOINT, {
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

  describe('JSON Export', () => {
    test('should export empty cycles array as JSON when no cycles exist', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        expect(status).toBe(200);
        expect(json).toHaveProperty('cycles');
        expect(json).toHaveProperty('exportedAt');
        expect(json).toHaveProperty('totalCount');
        expect(Array.isArray((json as { cycles: unknown[] }).cycles)).toBe(true);
        expect((json as { cycles: unknown[]; totalCount: number }).cycles.length).toBe(0);
        expect((json as { totalCount: number }).totalCount).toBe(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should export cycles as JSON with all fields', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create and complete a cycle
        const dates = yield* generateCycleDatesInPast(4);
        const createdCycle = yield* createCycleForUser(token, dates);
        yield* completeCycleForUser(token, createdCycle.id, dates);

        // Create an in-progress cycle
        const inProgressDates = yield* generateCycleDatesInPast(2);
        yield* createCycleForUser(token, inProgressDates);

        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        expect(status).toBe(200);

        const response = json as {
          cycles: Array<{
            id: string;
            status: string;
            startDate: string;
            endDate: string;
            notes: string | null;
            feelings: string[];
            createdAt: string;
            updatedAt: string;
          }>;
          exportedAt: string;
          totalCount: number;
        };

        expect(response.cycles.length).toBe(2);
        expect(response.totalCount).toBe(2);

        // Verify all fields are present
        for (const cycle of response.cycles) {
          expect(cycle).toHaveProperty('id');
          expect(cycle).toHaveProperty('status');
          expect(cycle).toHaveProperty('startDate');
          expect(cycle).toHaveProperty('endDate');
          expect(cycle).toHaveProperty('notes');
          expect(cycle).toHaveProperty('feelings');
          expect(cycle).toHaveProperty('createdAt');
          expect(cycle).toHaveProperty('updatedAt');
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should default to JSON when Accept is */*', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: '*/*',
          },
        });

        expect(status).toBe(200);
        expect(json).toHaveProperty('cycles');
        expect(json).toHaveProperty('exportedAt');
        expect(json).toHaveProperty('totalCount');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('CSV Export', () => {
    test('should export cycles as CSV with Accept: text/csv', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create a cycle
        const dates = yield* generateCycleDatesInPast(3);
        const createdCycle = yield* createCycleForUser(token, dates);
        yield* completeCycleForUser(token, createdCycle.id, dates);

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(ENDPOINT, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/csv',
              },
            }),
          catch: (e) => new Error(`Fetch failed: ${e}`),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/csv');
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        expect(response.headers.get('Content-Disposition')).toContain('.csv');

        const csvContent = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (e) => new Error(`Failed to read CSV: ${e}`),
        });

        // Verify CSV structure
        const lines = csvContent.split('\n');
        expect(lines[0]).toBe('id,status,startDate,endDate,notes,feelings,createdAt,updatedAt');
        expect(lines.length).toBeGreaterThan(1); // Header + at least one data row
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should export empty CSV with only headers when no cycles exist', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(ENDPOINT, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/csv',
              },
            }),
          catch: (e) => new Error(`Fetch failed: ${e}`),
        });

        expect(response.status).toBe(200);

        const csvContent = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (e) => new Error(`Failed to read CSV: ${e}`),
        });

        const lines = csvContent.split('\n');
        expect(lines[0]).toBe('id,status,startDate,endDate,notes,feelings,createdAt,updatedAt');
        expect(lines.length).toBe(1); // Only header row
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Content Negotiation Errors', () => {
    test('should return 406 for unsupported Accept header', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const { status, json } = yield* makeRequest(ENDPOINT, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/xml',
          },
        });

        expect(status).toBe(406);
        expect((json as { _tag: string })._tag).toBe('UnsupportedMediaTypeError');
        expect((json as { supportedTypes: string[] }).supportedTypes).toContain('application/json');
        expect((json as { supportedTypes: string[] }).supportedTypes).toContain('text/csv');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });

  describe('Response Headers', () => {
    test('should include Content-Disposition header for JSON export', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(ENDPOINT, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            }),
          catch: (e) => new Error(`Fetch failed: ${e}`),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        expect(response.headers.get('Content-Disposition')).toContain('.json');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });

    test('should include Content-Disposition header for CSV export', async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(ENDPOINT, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/csv',
              },
            }),
          catch: (e) => new Error(`Fetch failed: ${e}`),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Disposition')).toContain('attachment');
        expect(response.headers.get('Content-Disposition')).toContain('.csv');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers)));
    });
  });
});
