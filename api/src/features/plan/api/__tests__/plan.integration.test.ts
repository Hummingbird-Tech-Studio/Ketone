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

// ==================== Overlap Validation Tests (OV-02) ====================

describe('Plan API - Overlap Validation (OV-02)', () => {
  describe('Plan Creation with Overlap', () => {
    test(
      'should return 409 when plan overlaps with completed cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create and complete a cycle in the past
          const now = new Date();
          const cycleStart = new Date(now.getTime() - 10 * 60 * 60 * 1000); // 10 hours ago
          const cycleEnd = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

          // Create the cycle (will be InProgress)
          const createResult = yield* makeAuthenticatedRequest(CYCLES_ENDPOINT, 'POST', token, {
            startDate: cycleStart.toISOString(),
            endDate: cycleEnd.toISOString(),
          });
          expect(createResult.status).toBe(201);

          const cycleId = (createResult.json as { id: string }).id;

          // Complete the cycle (requires same dates in payload)
          const completeResult = yield* makeAuthenticatedRequest(`${CYCLES_ENDPOINT}/${cycleId}/complete`, 'POST', token, {
            startDate: cycleStart.toISOString(),
            endDate: cycleEnd.toISOString(),
          });
          expect(completeResult.status).toBe(200);

          // Now try to create a plan that overlaps with the completed cycle
          // Plan starts 8 hours ago (overlaps with the completed cycle that ran from -10h to -2h)
          const planStart = new Date(now.getTime() - 8 * 60 * 60 * 1000);

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
            startDate: planStart.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          });

          expect(status).toBe(409);
          expect((json as ErrorResponse)._tag).toBe('PlanOverlapError');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );

    test(
      'should allow plan creation when no overlap with completed cycles',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create and complete a cycle in the distant past
          const now = new Date();
          const cycleStart = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72 hours ago
          const cycleEnd = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

          // Create the cycle (will be InProgress)
          const createResult = yield* makeAuthenticatedRequest(CYCLES_ENDPOINT, 'POST', token, {
            startDate: cycleStart.toISOString(),
            endDate: cycleEnd.toISOString(),
          });
          expect(createResult.status).toBe(201);

          const cycleId = (createResult.json as { id: string }).id;

          // Complete the cycle
          const completeResult = yield* makeAuthenticatedRequest(`${CYCLES_ENDPOINT}/${cycleId}/complete`, 'POST', token, {
            startDate: cycleStart.toISOString(),
            endDate: cycleEnd.toISOString(),
          });
          expect(completeResult.status).toBe(200);

          // Now create a plan that starts in the future (no overlap)
          const planStart = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1 hour from now

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
            startDate: planStart.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          });

          expect(status).toBe(201);
          expect((json as { id: string }).id).toBeDefined();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 20000 },
    );
  });
});

// ==================== On-Demand Completion Tests ====================

describe('Plan API - On-Demand Completion', () => {
  test(
    'should mark plan as completed when all periods have ended',
    async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create a plan that started in the past and has already ended
        // Plan with 1 period of 1 hour fasting + 1 hour eating = 2 hours total
        const now = new Date();
        const planStart = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago

        const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
          startDate: planStart.toISOString(),
          periods: [{ fastingDuration: 1, eatingWindow: 1 }], // 2 hour total period that ended 1 hour ago
        });

        expect(status).toBe(201);
        const plan = json as { id: string; status: string };
        expect(plan.status).toBe('active');

        // When fetching the active plan, it should auto-complete
        const activeResult = yield* makeAuthenticatedRequest(`${ENDPOINT}/active`, 'GET', token);

        // The plan should now be completed
        expect(activeResult.status).toBe(200);
        const activePlan = activeResult.json as { id: string; status: string };
        expect(activePlan.status).toBe('completed');
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    },
    { timeout: 20000 },
  );
});

// ==================== Cycle Materialization on Cancel Tests ====================

describe('Plan API - Cycle Materialization on Cancel', () => {
  test(
    'should successfully cancel a plan that has started',
    async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create a plan that started 5 hours ago
        const now = new Date();
        const planStart = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5 hours ago

        // Create plan with 2 periods
        const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
          startDate: planStart.toISOString(),
          periods: [
            { fastingDuration: 2, eatingWindow: 1 },
            { fastingDuration: 2, eatingWindow: 1 },
          ],
        });

        expect(status).toBe(201);
        const plan = json as { id: string };

        // Cancel the plan - this should materialize cycles for started periods
        const cancelResult = yield* makeAuthenticatedRequest(`${ENDPOINT}/${plan.id}/cancel`, 'POST', token);
        expect(cancelResult.status).toBe(200);
        expect((cancelResult.json as { status: string }).status).toBe('cancelled');

        // After cancellation, there should be no active plan
        const activeResult = yield* makeAuthenticatedRequest(`${ENDPOINT}/active`, 'GET', token);
        expect(activeResult.status).toBe(404);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    },
    { timeout: 20000 },
  );

  test(
    'should successfully cancel a plan before it starts',
    async () => {
      const program = Effect.gen(function* () {
        const { token } = yield* createTestUserWithTracking();

        // Create a plan that starts in the future
        const now = new Date();
        const planStart = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

        const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
          startDate: planStart.toISOString(),
          periods: [{ fastingDuration: 16, eatingWindow: 8 }],
        });

        expect(status).toBe(201);
        const plan = json as { id: string };

        // Cancel the plan - no cycles should be created since plan hasn't started
        const cancelResult = yield* makeAuthenticatedRequest(`${ENDPOINT}/${plan.id}/cancel`, 'POST', token);
        expect(cancelResult.status).toBe(200);
        expect((cancelResult.json as { status: string }).status).toBe('cancelled');

        // After cancellation, there should be no active plan
        const activeResult = yield* makeAuthenticatedRequest(`${ENDPOINT}/active`, 'GET', token);
        expect(activeResult.status).toBe(404);
      }).pipe(Effect.provide(DatabaseLive));

      await Effect.runPromise(program);
    },
    { timeout: 20000 },
  );
});

// ============================================================================
// PUT /v1/plans/:planId/periods - Update Periods
// ============================================================================

describe('PUT /v1/plans/:planId/periods - Update Periods', () => {
  const ONE_HOUR_MS = 3600000;

  /**
   * Generate updated periods with new durations while maintaining contiguity
   */
  const generateUpdatedPeriods = (
    originalPeriods: Array<{
      id: string;
      startDate: string;
      fastingDuration: number;
      eatingWindow: number;
    }>,
    newDurations: Array<{ fastingDuration: number; eatingWindow: number }>,
  ) => {
    let currentStart = new Date(originalPeriods[0]!.startDate);

    return originalPeriods.map((period, index) => {
      const duration = newDurations[index] ?? { fastingDuration: period.fastingDuration, eatingWindow: period.eatingWindow };
      const totalMs = (duration.fastingDuration + duration.eatingWindow) * ONE_HOUR_MS;
      const endDate = new Date(currentStart.getTime() + totalMs);

      const result = {
        id: period.id,
        fastingDuration: duration.fastingDuration,
        eatingWindow: duration.eatingWindow,
        startDate: currentStart.toISOString(),
        endDate: endDate.toISOString(),
      };

      currentStart = endDate;
      return result;
    });
  };

  describe('Success Scenarios', () => {
    test(
      'should update periods successfully',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create plan with 3 periods (16:8 each)
          const plan = yield* createPlanForUser(token);

          // Update periods with new durations (20:4 for all)
          const updatedPeriods = generateUpdatedPeriods(
            plan.periods.map((p) => ({
              id: p.id,
              startDate: p.startDate.toISOString(),
              fastingDuration: p.fastingDuration,
              eatingWindow: p.eatingWindow,
            })),
            [
              { fastingDuration: 20, eatingWindow: 4 },
              { fastingDuration: 20, eatingWindow: 4 },
              { fastingDuration: 20, eatingWindow: 4 },
            ],
          );

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(200);
          const updatedPlan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(updatedPlan.periods).toHaveLength(3);

          // Verify durations were updated
          for (const period of updatedPlan.periods) {
            expect(period.fastingDuration).toBe(20);
            expect(period.eatingWindow).toBe(4);
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should maintain contiguity after update',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create plan with 2 periods
          const planData = {
            startDate: new Date().toISOString(),
            periods: [
              { fastingDuration: 16, eatingWindow: 8 },
              { fastingDuration: 16, eatingWindow: 8 },
            ],
          };
          const plan = yield* createPlanForUser(token, planData);

          // Update with different durations
          const updatedPeriods = generateUpdatedPeriods(
            plan.periods.map((p) => ({
              id: p.id,
              startDate: p.startDate.toISOString(),
              fastingDuration: p.fastingDuration,
              eatingWindow: p.eatingWindow,
            })),
            [
              { fastingDuration: 12, eatingWindow: 12 }, // 24h
              { fastingDuration: 18, eatingWindow: 6 }, // 24h
            ],
          );

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(200);
          const updatedPlan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);

          // Verify periods are still contiguous
          const period1End = new Date(updatedPlan.periods[0]!.endDate).getTime();
          const period2Start = new Date(updatedPlan.periods[1]!.startDate).getTime();
          expect(period1End).toBe(period2Start);
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
            `${ENDPOINT}/${NON_EXISTENT_UUID}/periods`,
            'PUT',
            token,
            {
              periods: [
                {
                  id: NON_EXISTENT_UUID,
                  fastingDuration: 16,
                  eatingWindow: 8,
                  startDate: new Date().toISOString(),
                  endDate: new Date(Date.now() + 24 * ONE_HOUR_MS).toISOString(),
                },
              ],
            },
          );

          expectPlanNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 404 when period ID does not exist',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          // Try to update with a non-existent period ID
          const updatedPeriods = plan.periods.map((p, i) => ({
            id: i === 0 ? NON_EXISTENT_UUID : p.id, // First ID is invalid
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
          }));

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(404);
          expect((json as ErrorResponse)._tag).toBe('PeriodNotFoundError');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Conflict (409)', () => {
    test(
      'should return 409 when plan is not active (cancelled)',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          // Cancel the plan
          yield* makeAuthenticatedRequest(`${ENDPOINT}/${plan.id}/cancel`, 'POST', token);

          // Try to update periods of cancelled plan
          const updatedPeriods = plan.periods.map((p) => ({
            id: p.id,
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
          }));

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expectPlanInvalidStateError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (422)', () => {
    test(
      'should return 422 when period count does not match',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token); // 3 periods

          // Try to send only 2 periods
          const updatedPeriods = plan.periods.slice(0, 2).map((p) => ({
            id: p.id,
            fastingDuration: p.fastingDuration,
            eatingWindow: p.eatingWindow,
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
          }));

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(422);
          expect((json as ErrorResponse)._tag).toBe('PeriodCountMismatchError');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 422 when periods are not contiguous',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          // Create non-contiguous periods (gap between them)
          const startDate = new Date(plan.periods[0]!.startDate);
          const updatedPeriods = plan.periods.map((p, index) => {
            const periodStart = new Date(startDate.getTime() + index * 48 * ONE_HOUR_MS); // 48h gap
            const periodEnd = new Date(periodStart.getTime() + 24 * ONE_HOUR_MS);
            return {
              id: p.id,
              fastingDuration: 16,
              eatingWindow: 8,
              startDate: periodStart.toISOString(),
              endDate: periodEnd.toISOString(),
            };
          });

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(422);
          expect((json as ErrorResponse)._tag).toBe('PeriodsNotContiguousError');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Validation (400)', () => {
    test(
      'should return 400 when fastingDuration is below minimum',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          const updatedPeriods = plan.periods.map((p, i) => ({
            id: p.id,
            fastingDuration: i === 0 ? 0 : p.fastingDuration, // Invalid duration
            eatingWindow: p.eatingWindow,
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
          }));

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

          expect(status).toBe(400);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 400 when eatingWindow exceeds maximum',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          const updatedPeriods = plan.periods.map((p, i) => ({
            id: p.id,
            fastingDuration: p.fastingDuration,
            eatingWindow: i === 0 ? 25 : p.eatingWindow, // Invalid window
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
          }));

          const { status } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${plan.id}/periods`,
            'PUT',
            token,
            { periods: updatedPeriods },
          );

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
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/periods`, 'PUT', { periods: [] });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when invalid token is provided',
      async () => {
        const program = expectUnauthorizedInvalidToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/periods`, 'PUT', { periods: [] });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});
