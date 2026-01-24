import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Schema as S } from 'effect';
import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { desc, eq } from 'drizzle-orm';
import { cyclesTable, DatabaseLive } from '../../../../db';
import {
  API_BASE_URL,
  createTestUser,
  deleteTestUser,
  type ErrorResponse,
  generateExpiredToken,
  makeRequest,
  validateJwtSecret,
} from '../../../../test-utils';
import { PlanResponseSchema, PlansListResponseSchema, PlanWithPeriodsResponseSchema } from '../schemas';

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/plans`;
const CYCLES_ENDPOINT = `${API_BASE_URL}/v1/cycles`;
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting Plan API test cleanup...');
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

    console.log(`✅ Deleted ${testData.userIds.size} test users and their data`);
    console.log('✅ Plan API test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  Plan API test cleanup failed:', error);
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
 * Generate valid plan data with 3 periods (16:8 fasting pattern)
 */
const generateValidPlanData = (startDate?: Date) => {
  const start = startDate ?? new Date();
  return {
    name: 'Test Plan',
    startDate: start.toISOString(),
    periods: [
      { fastingDuration: 16, eatingWindow: 8 },
      { fastingDuration: 16, eatingWindow: 8 },
      { fastingDuration: 16, eatingWindow: 8 },
    ],
  };
};

/**
 * Generate plan data with single period
 */
const generateSinglePeriodPlanData = (startDate?: Date) => {
  const start = startDate ?? new Date();
  return {
    name: 'Test Plan',
    startDate: start.toISOString(),
    periods: [{ fastingDuration: 16, eatingWindow: 8 }],
  };
};

const makeAuthenticatedRequest = (endpoint: string, method: string, token: string, body?: unknown) =>
  Effect.gen(function* () {
    const options: RequestInit = {
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

const createPlanForUser = (
  token: string,
  planData?: { name: string; startDate: string; periods: Array<{ fastingDuration: number; eatingWindow: number }> },
) =>
  Effect.gen(function* () {
    const data = planData ?? generateValidPlanData();

    const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, data);

    if (status !== 201) {
      throw new Error(`Failed to create plan: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
  });

const createCycleForUser = (token: string) =>
  Effect.gen(function* () {
    const now = new Date();
    const startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const endDate = new Date(now.getTime() + 14 * 60 * 60 * 1000); // 14 hours from now

    const { status, json } = yield* makeAuthenticatedRequest(CYCLES_ENDPOINT, 'POST', token, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    if (status !== 201) {
      throw new Error(`Failed to create cycle: ${status} - ${JSON.stringify(json)}`);
    }

    return json;
  });

const createCompletedCycleForUser = (token: string, daysAgoStart: number, daysAgoEnd: number) =>
  Effect.gen(function* () {
    const now = new Date();
    const startDate = new Date(now.getTime() - daysAgoStart * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - daysAgoEnd * 24 * 60 * 60 * 1000);

    // Create the cycle
    const { status: createStatus, json: createJson } = yield* makeAuthenticatedRequest(CYCLES_ENDPOINT, 'POST', token, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    if (createStatus !== 201) {
      throw new Error(`Failed to create cycle: ${createStatus} - ${JSON.stringify(createJson)}`);
    }

    const cycleId = (createJson as { id: string }).id;

    // Complete the cycle
    const { status: completeStatus, json: completeJson } = yield* makeAuthenticatedRequest(
      `${CYCLES_ENDPOINT}/${cycleId}/complete`,
      'POST',
      token,
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    );

    if (completeStatus !== 200) {
      throw new Error(`Failed to complete cycle: ${completeStatus} - ${JSON.stringify(completeJson)}`);
    }

    return { id: cycleId, startDate, endDate };
  });

/**
 * Fetch all cycles for a user via direct DB access.
 * Returns cycles ordered by startDate descending.
 */
const fetchCyclesForUserFromDb = (userId: string) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return yield* drizzle
      .select()
      .from(cyclesTable)
      .where(eq(cyclesTable.userId, userId))
      .orderBy(desc(cyclesTable.startDate));
  });

const expectPlanNotFoundError = (status: number, json: unknown) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanNotFoundError');
};

const expectNoActivePlanError = (status: number, json: unknown) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('NoActivePlanError');
};

const expectPlanAlreadyActiveError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanAlreadyActiveError');
};

const expectActiveCycleExistsError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('ActiveCycleExistsError');
};

const expectPlanInvalidStateError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanInvalidStateError');
};

const expectPeriodsMismatchError = (status: number, json: unknown) => {
  expect(status).toBe(422);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PeriodsMismatchError');
};

const expectPeriodNotInPlanError = (status: number, json: unknown) => {
  expect(status).toBe(422);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PeriodNotInPlanError');
};

const expectPeriodOverlapWithCycleError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse & { overlappingCycleId?: string };
  expect(error._tag).toBe('PeriodOverlapWithCycleError');
  expect(error.overlappingCycleId).toBeDefined();
};

const expectUnauthorizedNoToken = (endpoint: string, method: string, body?: unknown) =>
  Effect.gen(function* () {
    const options: RequestInit = {
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
    const options: RequestInit = {
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

    const options: RequestInit = {
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

// ============================================================================
// POST /v1/plans - Create Plan
// ============================================================================

describe('POST /v1/plans - Create Plan', () => {
  describe('Success Scenarios', () => {
    test(
      'should create a plan with valid data',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const planData = generateValidPlanData();

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.userId).toBe(userId);
          expect(plan.status).toBe('InProgress');
          expect(plan.periods).toHaveLength(3);
          const firstPeriod = plan.periods[0]!;
          expect(firstPeriod.order).toBe(1);
          expect(firstPeriod.fastingDuration).toBe(16);
          expect(firstPeriod.eatingWindow).toBe(8);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create a plan with single period',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = generateSinglePeriodPlanData();

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.periods).toHaveLength(1);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create a plan with maximum 31 periods',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: Array(31).fill({ fastingDuration: 16, eatingWindow: 8 }),
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.periods).toHaveLength(31);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should calculate consecutive period dates correctly',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const startDate = new Date();
          const planData = {
            name: 'Test Plan',
            startDate: startDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // 24 hours total
              { fastingDuration: 20, eatingWindow: 4 }, // 24 hours total
            ],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);

          // First period should start at plan start date
          const firstPeriod = plan.periods[0]!;
          const secondPeriod = plan.periods[1]!;
          const firstPeriodEnd = new Date(firstPeriod.endDate);

          // Second period should start where first ends
          const secondPeriodStart = new Date(secondPeriod.startDate);

          expect(firstPeriodEnd.getTime()).toBe(secondPeriodStart.getTime());
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create a plan with name and description and return them correctly',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'My Fasting Plan',
            description: 'A 16:8 intermittent fasting plan for weight loss',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.name).toBe('My Fasting Plan');
          expect(plan.description).toBe('A 16:8 intermittent fasting plan for weight loss');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create a plan without description and return null for description',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'My Fasting Plan',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.name).toBe('My Fasting Plan');
          expect(plan.description).toBeNull();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should accept name with exactly 100 characters',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const longName = 'a'.repeat(100);
          const planData = {
            name: longName,
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.name).toBe(longName);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should accept description with exactly 500 characters',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const longDescription = 'a'.repeat(500);
          const planData = {
            name: 'Test Plan',
            description: longDescription,
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.description).toBe(longDescription);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should normalize empty description string to null',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            description: '',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.description).toBeNull();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should normalize whitespace-only description to null',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            description: '   ',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.description).toBeNull();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400/422)', () => {
    test(
      'should return 400 when periods array is empty',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: [],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when periods exceed maximum of 31',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: Array(32).fill({ fastingDuration: 16, eatingWindow: 8 }),
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when fastingDuration is below minimum',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 0, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when fastingDuration exceeds maximum of 168',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 169, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when eatingWindow is below minimum',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 0 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when eatingWindow exceeds maximum of 24',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 25 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when startDate is missing',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when name is missing',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when name is empty string',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: '',
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when name exceeds 100 characters',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'a'.repeat(101),
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when description exceeds 500 characters',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
            name: 'Test Plan',
            description: 'a'.repeat(501),
            startDate: new Date().toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Conflict (409)', () => {
    test(
      'should return 409 when user already has an active plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create first plan
          yield* createPlanForUser(token);

          // Try to create second plan
          const planData = generateValidPlanData();
          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expectPlanAlreadyActiveError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when user has an active standalone cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a standalone cycle first
          yield* createCycleForUser(token);

          // Try to create a plan
          const planData = generateValidPlanData();
          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expectActiveCycleExistsError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when plan periods overlap with existing completed cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create and complete a cycle (5-3 days ago)
          yield* createCompletedCycleForUser(token, 5, 3);

          // Try to create a plan with periods that overlap with the completed cycle
          // Start the plan 4 days ago (overlapping with the 5-3 days ago cycle)
          const now = new Date();
          const overlappingStartDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
          const planData = {
            name: 'Test Plan',
            startDate: overlappingStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // This period will overlap
              { fastingDuration: 16, eatingWindow: 8 },
            ],
          };

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expectPeriodOverlapWithCycleError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(ENDPOINT, 'POST', generateValidPlanData());
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
        const program = expectUnauthorizedInvalidToken(ENDPOINT, 'POST', generateValidPlanData());
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
        const program = expectUnauthorizedExpiredToken(ENDPOINT, 'POST', generateValidPlanData());
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// GET /v1/plans/active - Get Active Plan
// ============================================================================

describe('GET /v1/plans/active - Get Active Plan', () => {
  describe('Success Scenarios', () => {
    test(
      'should return active plan with periods',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/active`, 'GET', token);

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.id).toBe(createdPlan.id);
          expect(plan.userId).toBe(userId);
          expect(plan.status).toBe('InProgress');
          expect(plan.periods).toHaveLength(3);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when no active plan exists',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/active`, 'GET', token);

          expectNoActivePlanError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/active`, 'GET');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// GET /v1/plans/:id - Get Plan by ID
// ============================================================================

describe('GET /v1/plans/:id - Get Plan by ID', () => {
  describe('Success Scenarios', () => {
    test(
      'should return plan with periods by ID',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}`, 'GET', token);

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.id).toBe(createdPlan.id);
          expect(plan.userId).toBe(userId);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when plan does not exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET', token);

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      "should return 404 when accessing another user's plan",
      async () => {
        const program = Effect.gen(function* () {
          const userA = yield* createTestUserWithTracking();
          const planA = yield* createPlanForUser(userA.token);

          const userB = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${planA.id}`, 'GET', userB.token);

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Bad Request (400)', () => {
    test(
      'should return 400 when ID is not a valid UUID',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/not-a-uuid`, 'GET', token);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// GET /v1/plans - List Plans
// ============================================================================

describe('GET /v1/plans - List Plans', () => {
  describe('Success Scenarios', () => {
    test(
      'should return empty array when no plans exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'GET', token);

          expect(status).toBe(200);
          const plans = yield* S.decodeUnknown(PlansListResponseSchema)(json);
          expect(plans).toHaveLength(0);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return list of plans without periods',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'GET', token);

          expect(status).toBe(200);
          const plans = yield* S.decodeUnknown(PlansListResponseSchema)(json);
          expect(plans).toHaveLength(1);
          const firstPlan = plans[0]!;
          expect(firstPlan.status).toBe('InProgress');
          // List should not include periods
          expect((firstPlan as any).periods).toBeUndefined();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(ENDPOINT, 'GET');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// POST /v1/plans/:id/cancel - Cancel Plan
// ============================================================================

describe('POST /v1/plans/:id/cancel - Cancel Plan', () => {
  describe('Success Scenarios', () => {
    test(
      'should cancel an active plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/cancel`,
            'POST',
            token,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanResponseSchema)(json);
          expect(plan.id).toBe(createdPlan.id);
          expect(plan.status).toBe('Cancelled');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should allow creating a new plan after cancelling the previous one',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create and cancel first plan
          const firstPlan = yield* createPlanForUser(token);
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${firstPlan.id}/cancel`, 'POST', token);

          // Create second plan should succeed
          const planData = generateValidPlanData();
          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.status).toBe('InProgress');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Cancellation Behavior', () => {
    test(
      'should create cycle record when cancelling plan with in-progress period',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

          // Create a plan that starts in the past so the first period is "in progress"
          // First period: 16h fasting + 8h eating = 24h total
          // Start the plan 8 hours ago so now is within the first period
          const now = new Date();
          const planStartDate = new Date(now.getTime() - 8 * 60 * 60 * 1000); // 8 hours ago
          const planData = {
            name: 'Test Plan',
            startDate: planStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // Period 1: -8h to +16h from now (in progress)
              { fastingDuration: 16, eatingWindow: 8 }, // Period 2: +16h to +40h
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);
          const firstPeriod = createdPlan.periods[0]!;

          // Record time before cancellation
          const beforeCancel = new Date();

          // Cancel the plan - first period should be detected as in-progress via date check
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/cancel`,
            'POST',
            token,
          );

          // Record time after cancellation
          const afterCancel = new Date();

          expect(status).toBe(200);
          const cancelledPlan = yield* S.decodeUnknown(PlanResponseSchema)(json);
          expect(cancelledPlan.status).toBe('Cancelled');

          // Fetch cycles from DB and verify one was created
          const cycles = yield* fetchCyclesForUserFromDb(userId);
          expect(cycles.length).toBe(1);

          const createdCycle = cycles[0]!;
          expect(createdCycle.status).toBe('Completed');

          // Verify the cycle's startDate matches the period's startDate
          const periodStartDate = new Date(firstPeriod.startDate);
          expect(createdCycle.startDate.getTime()).toBe(periodStartDate.getTime());

          // Verify the cycle's endDate is approximately the cancellation time
          expect(createdCycle.endDate.getTime()).toBeGreaterThanOrEqual(beforeCancel.getTime());
          expect(createdCycle.endDate.getTime()).toBeLessThanOrEqual(afterCancel.getTime());
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );

    test(
      'should use fastingEndDate as cycle endDate when cancelled during eating window',
      async () => {
        const program = Effect.gen(function* () {
          const { token, userId } = yield* createTestUserWithTracking();

          // Create a plan that started 20 hours ago
          // With 16h fasting + 8h eating = 24h total, at hour 20 we're in eating window
          const now = new Date();
          const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
          const planData = {
            name: 'Test Plan - Eating Window Cancel',
            startDate: twentyHoursAgo.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status: createStatus, json: createJson } = yield* makeAuthenticatedRequest(
            ENDPOINT,
            'POST',
            token,
            planData,
          );

          if (createStatus !== 201) {
            throw new Error(`Failed to create plan: ${createStatus}`);
          }

          const createdPlan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(createJson);
          const firstPeriod = createdPlan.periods[0]!;

          // Cancel the plan (during eating window)
          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/cancel`, 'POST', token);

          expect(status).toBe(200);

          // Fetch cycles from DB
          const cycles = yield* fetchCyclesForUserFromDb(userId);
          expect(cycles.length).toBe(1);

          const createdCycle = cycles[0]!;
          expect(createdCycle.status).toBe('Completed');

          // startDate should be fastingStartDate
          expect(createdCycle.startDate.getTime()).toBe(new Date(firstPeriod.fastingStartDate).getTime());

          // endDate should be fastingEndDate (NOT cancellation time, since fasting completed)
          expect(createdCycle.endDate!.getTime()).toBe(new Date(firstPeriod.fastingEndDate).getTime());
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should use cancellation time as cycle endDate when cancelled during fasting phase',
      async () => {
        const program = Effect.gen(function* () {
          const { token, userId } = yield* createTestUserWithTracking();

          // Create a plan that started 8 hours ago
          // With 16h fasting + 8h eating = 24h total, at hour 8 we're still in fasting
          const now = new Date();
          const eightHoursAgo = new Date(now.getTime() - 8 * 60 * 60 * 1000);
          const planData = {
            name: 'Test Plan - Fasting Cancel',
            startDate: eightHoursAgo.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };

          const { status: createStatus, json: createJson } = yield* makeAuthenticatedRequest(
            ENDPOINT,
            'POST',
            token,
            planData,
          );

          if (createStatus !== 201) {
            throw new Error(`Failed to create plan: ${createStatus}`);
          }

          const createdPlan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(createJson);
          const firstPeriod = createdPlan.periods[0]!;

          // Record time before cancellation
          const beforeCancel = new Date();

          // Cancel the plan (during fasting phase)
          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/cancel`, 'POST', token);

          const afterCancel = new Date();

          expect(status).toBe(200);

          // Fetch cycles from DB
          const cycles = yield* fetchCyclesForUserFromDb(userId);
          expect(cycles.length).toBe(1);

          const createdCycle = cycles[0]!;
          expect(createdCycle.status).toBe('Completed');

          // startDate should be fastingStartDate
          expect(createdCycle.startDate.getTime()).toBe(new Date(firstPeriod.fastingStartDate).getTime());

          // endDate should be cancellation time (between beforeCancel and afterCancel)
          expect(createdCycle.endDate!.getTime()).toBeGreaterThanOrEqual(beforeCancel.getTime());
          expect(createdCycle.endDate!.getTime()).toBeLessThanOrEqual(afterCancel.getTime());

          // endDate should be BEFORE fastingEndDate (since we cancelled during fasting)
          expect(createdCycle.endDate!.getTime()).toBeLessThan(new Date(firstPeriod.fastingEndDate).getTime());
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should not create cycle when cancelling plan with no in-progress period',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

          // Create a plan that starts far in the future so no period is in progress
          const now = new Date();
          const futureStartDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
          const planData = {
            name: 'Future Plan',
            startDate: futureStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 },
              { fastingDuration: 16, eatingWindow: 8 },
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          // Cancel the plan - no period should be in progress (all in the future)
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/cancel`,
            'POST',
            token,
          );

          expect(status).toBe(200);
          const cancelledPlan = yield* S.decodeUnknown(PlanResponseSchema)(json);
          expect(cancelledPlan.status).toBe('Cancelled');

          // Fetch cycles from DB and verify none were created
          const cycles = yield* fetchCyclesForUserFromDb(userId);
          expect(cycles.length).toBe(0);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create cycles for all completed periods when cancelling plan',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

          // Create a plan that started in the past with multiple periods
          // Period 1: completed (in the past)
          // Period 2: completed (in the past)
          // Period 3: in-progress (current)
          const now = new Date();

          // Each period is 16h fasting + 8h eating = 24h total
          // Start 3 days ago so first 2 periods are complete and 3rd is in progress
          const startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

          const planData = {
            name: 'Test Plan - Multiple Completed Periods',
            startDate: startDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // Day 1: completed
              { fastingDuration: 16, eatingWindow: 8 }, // Day 2: completed
              { fastingDuration: 16, eatingWindow: 8 }, // Day 3: in-progress
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          // Cancel the plan
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/cancel`,
            'POST',
            token,
          );

          expect(status).toBe(200);
          const cancelledPlan = yield* S.decodeUnknown(PlanResponseSchema)(json);
          expect(cancelledPlan.status).toBe('Cancelled');

          // Fetch cycles from DB
          const cycles = yield* fetchCyclesForUserFromDb(userId);

          // Should have 3 cycles: 2 for completed periods + 1 for in-progress period
          expect(cycles.length).toBe(3);

          // All cycles should be completed
          expect(cycles.every((c) => c.status === 'Completed')).toBe(true);

          // Sort cycles by startDate to verify order
          const sortedCycles = cycles.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

          // Verify first two cycles (completed periods) have full fasting durations
          // Each fasting duration is 16 hours
          const expectedFastingDurationMs = 16 * 60 * 60 * 1000;

          // First completed period
          const cycle1Duration = sortedCycles[0]!.endDate!.getTime() - sortedCycles[0]!.startDate.getTime();
          expect(cycle1Duration).toBe(expectedFastingDurationMs);

          // Second completed period
          const cycle2Duration = sortedCycles[1]!.endDate!.getTime() - sortedCycles[1]!.startDate.getTime();
          expect(cycle2Duration).toBe(expectedFastingDurationMs);

          // Third cycle (in-progress) should have partial duration (less than 16 hours)
          // since we cancelled during the 3rd period
          const cycle3Duration = sortedCycles[2]!.endDate!.getTime() - sortedCycles[2]!.startDate.getTime();
          expect(cycle3Duration).toBeLessThanOrEqual(expectedFastingDurationMs);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      "should return 404 when accessing another user's plan for cancellation",
      async () => {
        const program = Effect.gen(function* () {
          // User A creates a plan
          const userA = yield* createTestUserWithTracking();
          const planA = yield* createPlanForUser(userA.token);

          // User B tries to cancel User A's plan
          const userB = yield* createTestUserWithTracking();
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${planA.id}/cancel`,
            'POST',
            userB.token,
          );

          // Should return 404 (not 403) to avoid leaking existence of plans
          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when plan does not exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${NON_EXISTENT_UUID}/cancel`,
            'POST',
            token,
          );

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Invalid State (409)', () => {
    test(
      'should return 409 when trying to cancel an already cancelled plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Cancel the plan first time
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/cancel`, 'POST', token);

          // Try to cancel again
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/cancel`,
            'POST',
            token,
          );

          expectPlanInvalidStateError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/cancel`, 'POST');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// PUT /v1/plans/:id/periods - Update Plan Periods
// ============================================================================

describe('PUT /v1/plans/:id/periods - Update Plan Periods', () => {
  describe('Success Scenarios', () => {
    test(
      'should update periods with new durations',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Build the update payload with new durations
          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 18, // Changed from 16
              eatingWindow: 6, // Changed from 8
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.userId).toBe(userId);
          expect(plan.periods).toHaveLength(3);
          // Verify all periods have updated durations
          for (const period of plan.periods) {
            expect(period.fastingDuration).toBe(18);
            expect(period.eatingWindow).toBe(6);
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should maintain period contiguity after update',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Update first period to be longer, should shift subsequent periods
          const updatePayload = {
            periods: createdPlan.periods.map((p, index) => ({
              id: p.id,
              fastingDuration: index === 0 ? 20 : 16, // First period longer
              eatingWindow: index === 0 ? 4 : 8,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);

          // Verify contiguity: each period's start should equal previous period's end
          for (let i = 1; i < plan.periods.length; i++) {
            const prevPeriod = plan.periods[i - 1]!;
            const currPeriod = plan.periods[i]!;
            const prevEnd = new Date(prevPeriod.endDate);
            const currStart = new Date(currPeriod.startDate);
            expect(prevEnd.getTime()).toBe(currStart.getTime());
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should allow updating periods that are in the past (ED-02)',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan that started in the past with some periods already "completed" by time
          const now = new Date();
          const pastStartDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
          const planData = {
            name: 'Test Plan',
            startDate: pastStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // Period 1: completed by time
              { fastingDuration: 16, eatingWindow: 8 }, // Period 2: completed by time
              { fastingDuration: 16, eatingWindow: 8 }, // Period 3: in progress or future
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          // Update all periods including the past ones
          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 18,
              eatingWindow: 6,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          // All periods should be updated
          for (const period of plan.periods) {
            expect(period.fastingDuration).toBe(18);
            expect(period.eatingWindow).toBe(6);
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400/422)', () => {
    test(
      'should return 400 when fastingDuration is below minimum',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 0, // Invalid: below minimum
              eatingWindow: 8,
            })),
          };

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when fastingDuration exceeds maximum of 168',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 169, // Invalid: above maximum
              eatingWindow: 8,
            })),
          };

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when eatingWindow exceeds maximum of 24',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 16,
              eatingWindow: 25, // Invalid: above maximum
            })),
          };

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 422 when period count does not match (IM-01)',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Send only 2 periods instead of 3
          const updatePayload = {
            periods: createdPlan.periods.slice(0, 2).map((p) => ({
              id: p.id,
              fastingDuration: 18,
              eatingWindow: 6,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expectPeriodsMismatchError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 422 when period ID does not belong to plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Use a non-existent period ID
          const updatePayload = {
            periods: createdPlan.periods.map((p, index) => ({
              id: index === 0 ? NON_EXISTENT_UUID : p.id,
              fastingDuration: 18,
              eatingWindow: 6,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expectPeriodNotInPlanError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Conflict (409)', () => {
    test(
      'should succeed when updated periods do not overlap with existing cycles',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // First, create and complete a cycle in the past (5-4 days ago)
          yield* createCompletedCycleForUser(token, 5, 4);

          // Create a plan that starts AFTER the completed cycle (in the future)
          const now = new Date();
          const futureStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day in future
          const planData = {
            name: 'Test Plan',
            startDate: futureStart.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 },
              { fastingDuration: 16, eatingWindow: 8 },
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          // Update the periods - should succeed because no overlap with past cycle
          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 20,
              eatingWindow: 4,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.periods[0]!.fastingDuration).toBe(20);
          expect(plan.periods[0]!.eatingWindow).toBe(4);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );

    test(
      'should return 409 when updated periods overlap with existing cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Step 1: Create and complete a cycle from 1.5 days ago to 1 day ago
          // This is the "obstacle" that the extended plan will overlap with
          yield* createCompletedCycleForUser(token, 1.5, 1);

          // Step 2: Create a plan starting 5 days ago with short periods
          // 2 periods × 24h (16+8) = 48h total = 2 days
          // Plan runs from 5 days ago to 3 days ago - NO overlap with cycle (1.5-1 days ago)
          const now = new Date();
          const pastStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
          const planData = {
            name: 'Test Plan',
            startDate: pastStart.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // 24h
              { fastingDuration: 16, eatingWindow: 8 }, // 24h
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          // Step 3: Update periods with LONGER durations
          // 2 periods × 60h (36+24) = 120h total = 5 days
          // Extended plan runs from 5 days ago to TODAY
          // This now OVERLAPS with the cycle (1.5-1 days ago)
          const updatePayload = {
            periods: createdPlan.periods.map((p) => ({
              id: p.id,
              fastingDuration: 36,
              eatingWindow: 24,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expectPeriodOverlapWithCycleError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when plan does not exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const updatePayload = {
            periods: [{ id: NON_EXISTENT_UUID, fastingDuration: 18, eatingWindow: 6 }],
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${NON_EXISTENT_UUID}/periods`,
            'PUT',
            token,
            updatePayload,
          );

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      "should return 404 when accessing another user's plan",
      async () => {
        const program = Effect.gen(function* () {
          const userA = yield* createTestUserWithTracking();
          const planA = yield* createPlanForUser(userA.token);

          const userB = yield* createTestUserWithTracking();

          const updatePayload = {
            periods: planA.periods.map((p) => ({
              id: p.id,
              fastingDuration: 18,
              eatingWindow: 6,
            })),
          };

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${planA.id}/periods`,
            'PUT',
            userB.token,
            updatePayload,
          );

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const updatePayload = {
          periods: [{ id: NON_EXISTENT_UUID, fastingDuration: 18, eatingWindow: 6 }],
        };
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/periods`, 'PUT', updatePayload);
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
        const updatePayload = {
          periods: [{ id: NON_EXISTENT_UUID, fastingDuration: 18, eatingWindow: 6 }],
        };
        const program = expectUnauthorizedInvalidToken(
          `${ENDPOINT}/${NON_EXISTENT_UUID}/periods`,
          'PUT',
          updatePayload,
        );
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
        const updatePayload = {
          periods: [{ id: NON_EXISTENT_UUID, fastingDuration: 18, eatingWindow: 6 }],
        };
        const program = expectUnauthorizedExpiredToken(
          `${ENDPOINT}/${NON_EXISTENT_UUID}/periods`,
          'PUT',
          updatePayload,
        );
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// POST /v1/plans/:id/complete - Complete Plan
// ============================================================================

const expectPeriodsNotCompletedError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse & { completedCount?: number; totalCount?: number };
  expect(error._tag).toBe('PeriodsNotCompletedError');
  expect(error.completedCount).toBeDefined();
  expect(error.totalCount).toBeDefined();
};

/**
 * Create a plan with all periods in the past (completed by time).
 */
const createPlanWithAllPeriodsCompleted = (token: string) =>
  Effect.gen(function* () {
    // Start 5 days ago with 3 periods of 24h each = 3 days
    // All periods will have ended by now
    const now = new Date();
    const pastStartDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const planData = {
      name: 'Test Plan',
      startDate: pastStartDate.toISOString(),
      periods: [
        { fastingDuration: 16, eatingWindow: 8 }, // Day 1
        { fastingDuration: 16, eatingWindow: 8 }, // Day 2
        { fastingDuration: 16, eatingWindow: 8 }, // Day 3
      ],
    };

    const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

    if (status !== 201) {
      throw new Error(`Failed to create plan: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
  });

describe('POST /v1/plans/:id/complete - Complete Plan', () => {
  describe('Success Scenarios', () => {
    test(
      'should complete a plan when all periods are completed (by time)',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan with all periods in the past
          const createdPlan = yield* createPlanWithAllPeriodsCompleted(token);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expect(status).toBe(200);
          const plan = yield* S.decodeUnknown(PlanResponseSchema)(json);
          expect(plan.id).toBe(createdPlan.id);
          expect(plan.status).toBe('Completed');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should create cycles for all periods with correct fasting dates when completing a plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token, userId } = yield* createTestUserWithTracking();

          // Create a plan with all periods in the past
          const createdPlan = yield* createPlanWithAllPeriodsCompleted(token);

          // Complete the plan
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/complete`, 'POST', token);

          // Fetch cycles from DB
          const cycles = yield* fetchCyclesForUserFromDb(userId);

          // Should have created one cycle per period
          expect(cycles.length).toBe(createdPlan.periods.length);

          // Verify each cycle has correct fasting dates (NOT period.endDate which includes eating)
          // Cycles are ordered by startDate DESC, periods are ordered by order ASC
          const sortedPeriods = [...createdPlan.periods].sort(
            (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
          );

          for (let i = 0; i < cycles.length; i++) {
            const cycle = cycles[i]!;
            const period = sortedPeriods[i]!;

            expect(cycle.status).toBe('Completed');
            // startDate should be fastingStartDate
            expect(cycle.startDate.getTime()).toBe(new Date(period.fastingStartDate).getTime());
            // endDate should be fastingEndDate (NOT period.endDate which is eatingEndDate)
            expect(cycle.endDate!.getTime()).toBe(new Date(period.fastingEndDate).getTime());
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should allow creating a new plan after completing the previous one',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create first plan with all periods in the past
          const firstPlan = yield* createPlanWithAllPeriodsCompleted(token);

          // Complete the plan
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${firstPlan.id}/complete`, 'POST', token);

          // Create second plan should succeed
          const now = new Date();
          const futureStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day in future
          const planData = {
            name: 'Second Plan',
            startDate: futureStart.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          };
          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, planData);

          expect(status).toBe(201);
          const plan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(plan.status).toBe('InProgress');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );
  });

  describe('Error Scenarios - Periods Not Completed (409)', () => {
    test(
      'should return 409 when not all periods are completed (only some in the past)',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan where only the first period is in the past
          // Start 2 days ago with 3 periods of 24h each
          // Only period 1 (day 1-2) will be completed, periods 2-3 are still in future
          const now = new Date();
          const pastStartDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
          const planData = {
            name: 'Test Plan',
            startDate: pastStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // Day 1 - completed
              { fastingDuration: 16, eatingWindow: 8 }, // Day 2 - in progress or future
              { fastingDuration: 16, eatingWindow: 8 }, // Day 3 - future
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expectPeriodsNotCompletedError(status, json);
          const error = json as ErrorResponse & { completedCount: number; totalCount: number };
          // completedCount will depend on exact timing, but should be < 3
          expect(error.totalCount).toBe(3);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when all periods are still in the future',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan that starts in the future
          const createdPlan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expectPeriodsNotCompletedError(status, json);
          const error = json as ErrorResponse & { completedCount: number; totalCount: number };
          expect(error.completedCount).toBe(0);
          expect(error.totalCount).toBe(3);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when last period is still in progress',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan where only the last period is still in progress
          // Start 3 days ago with 3 periods of 24h each, last period ends in future
          const now = new Date();
          const pastStartDate = new Date(now.getTime() - 60 * 60 * 60 * 1000); // 60 hours ago (~2.5 days)
          const planData = {
            name: 'Test Plan',
            startDate: pastStartDate.toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 }, // Completed
              { fastingDuration: 16, eatingWindow: 8 }, // Completed
              { fastingDuration: 16, eatingWindow: 8 }, // In progress (started ~12h ago, ends ~12h from now)
            ],
          };

          const createdPlan = yield* createPlanForUser(token, planData);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expectPeriodsNotCompletedError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Invalid State (409)', () => {
    test(
      'should return 409 when trying to complete an already cancelled plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan with all periods in the past
          const createdPlan = yield* createPlanWithAllPeriodsCompleted(token);

          // Cancel the plan first
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/cancel`, 'POST', token);

          // Try to complete
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expectPlanInvalidStateError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when trying to complete an already completed plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan with all periods in the past
          const createdPlan = yield* createPlanWithAllPeriodsCompleted(token);

          // Complete the plan first time
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/complete`, 'POST', token);

          // Try to complete again
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}/complete`,
            'POST',
            token,
          );

          expectPlanInvalidStateError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 when plan does not exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${NON_EXISTENT_UUID}/complete`,
            'POST',
            token,
          );

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      "should return 404 when accessing another user's plan for completion",
      async () => {
        const program = Effect.gen(function* () {
          // User A creates a plan with all periods in the past
          const userA = yield* createTestUserWithTracking();
          const planA = yield* createPlanWithAllPeriodsCompleted(userA.token);

          // User B tries to complete User A's plan
          const userB = yield* createTestUserWithTracking();
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${planA.id}/complete`,
            'POST',
            userB.token,
          );

          // Should return 404 (not 403) to avoid leaking existence of plans
          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Bad Request (400)', () => {
    test(
      'should return 400 when ID is not a valid UUID',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/not-a-uuid/complete`, 'POST', token);

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/complete`, 'POST');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
        const program = expectUnauthorizedInvalidToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/complete`, 'POST');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when expired token is provided',
      async () => {
        const program = expectUnauthorizedExpiredToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/complete`, 'POST');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});
