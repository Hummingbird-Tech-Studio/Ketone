import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Schema as S } from 'effect';
import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { desc, eq } from 'drizzle-orm';
import { cyclesTable, DatabaseLive, periodsTable } from '../../../../db';
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
  planData?: { startDate: string; periods: Array<{ fastingDuration: number; eatingWindow: number }> },
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
 * Set a period's status to 'in_progress' via direct DB access.
 * Used for testing the cancellation behavior when a period is actively running.
 */
const setPeriodStatusToInProgress = (periodId: string) =>
  Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    yield* drizzle
      .update(periodsTable)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(periodsTable.id, periodId));
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
          expect(firstPeriod.status).toBe('scheduled');
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
  });

  describe('Error Scenarios - Validation (400/422)', () => {
    test(
      'should return 400 when periods array is empty',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const planData = {
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

          // Create a plan
          const createdPlan = yield* createPlanForUser(token);
          const firstPeriod = createdPlan.periods[0]!;

          // Manually set the first period to 'in_progress' (simulating that fasting started)
          yield* setPeriodStatusToInProgress(firstPeriod.id);

          // Record time before cancellation
          const beforeCancel = new Date();

          // Cancel the plan
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
      'should not create cycle when cancelling plan with no in-progress period',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();

          // Create a plan (all periods are 'scheduled' by default)
          const createdPlan = yield* createPlanForUser(token);

          // Cancel the plan without setting any period to in_progress
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
// DELETE /v1/plans/:id - Delete Plan
// ============================================================================

describe('DELETE /v1/plans/:id - Delete Plan', () => {
  describe('Success Scenarios', () => {
    test(
      'should delete a cancelled plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          // Cancel the plan first
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}/cancel`, 'POST', token);

          // Delete the cancelled plan
          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}`, 'DELETE', token);

          expect(status).toBe(204);

          // Verify plan is deleted
          const { status: getStatus, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${createdPlan.id}`,
            'GET',
            token,
          );
          expectPlanNotFoundError(getStatus, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Invalid State (409)', () => {
    test(
      'should return 409 when trying to delete an active plan',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const createdPlan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${createdPlan.id}`, 'DELETE', token);

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

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'DELETE', token);

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

          // Cancel so it's deletable
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${planA.id}/cancel`, 'POST', userA.token);

          const userB = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${planA.id}`, 'DELETE', userB.token);

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
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'DELETE');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});
