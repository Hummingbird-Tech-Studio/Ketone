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
import { PlanWithPeriodsResponseSchema, PlansListResponseSchema, PlanResponseSchema } from '../schemas';

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
          expect(plan.status).toBe('active');
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
          expect(plan.status).toBe('active');
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
          expect(firstPlan.status).toBe('active');
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
          expect(plan.status).toBe('cancelled');
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
          expect(plan.status).toBe('active');
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
