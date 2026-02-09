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
import {
  PlanTemplateWithPeriodsResponseSchema,
  PlanTemplatesListResponseSchema,
  PlanWithPeriodsResponseSchema,
} from '../schemas';
import { MAX_PLAN_TEMPLATES } from '../../domain';

validateJwtSecret();

const ENDPOINT = `${API_BASE_URL}/v1/plan-templates`;
const PLANS_ENDPOINT = `${API_BASE_URL}/v1/plans`;
const CYCLES_ENDPOINT = `${API_BASE_URL}/v1/cycles`;
const NON_EXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting Plan Template API test cleanup...');
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
    console.log('✅ Plan Template API test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  Plan Template API test cleanup failed:', error);
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

    const { status, json } = yield* makeAuthenticatedRequest(PLANS_ENDPOINT, 'POST', token, data);

    if (status !== 201) {
      throw new Error(`Failed to create plan: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
  });

const createTemplateForUser = (token: string, planId: string) =>
  Effect.gen(function* () {
    const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, { planId });

    if (status !== 201) {
      throw new Error(`Failed to create template: ${status} - ${JSON.stringify(json)}`);
    }

    return yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
  });

const createCompletedCycleForUser = (token: string, daysAgoStart: number, daysAgoEnd: number) =>
  Effect.gen(function* () {
    const now = new Date();
    const startDate = new Date(now.getTime() - daysAgoStart * 24 * 60 * 60 * 1000);
    const endDate = new Date(now.getTime() - daysAgoEnd * 24 * 60 * 60 * 1000);

    const { status: createStatus, json: createJson } = yield* makeAuthenticatedRequest(CYCLES_ENDPOINT, 'POST', token, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    if (createStatus !== 201) {
      throw new Error(`Failed to create cycle: ${createStatus} - ${JSON.stringify(createJson)}`);
    }

    const cycleId = (createJson as { id: string }).id;

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

    return { cycleId, startDate, endDate };
  });

// ─── Error Expectation Helpers ──────────────────────────────────────────────

const expectTemplateNotFoundError = (status: number, json: unknown) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanTemplateNotFoundError');
};

const expectPlanNotFoundError = (status: number, json: unknown) => {
  expect(status).toBe(404);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanNotFoundError');
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

const expectTemplateLimitReachedError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PlanTemplateLimitReachedError');
};

const expectPeriodOverlapWithCycleError = (status: number, json: unknown) => {
  expect(status).toBe(409);
  const error = json as ErrorResponse;
  expect(error._tag).toBe('PeriodOverlapWithCycleError');
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
// POST /v1/plan-templates - Create Plan Template
// ============================================================================

describe('POST /v1/plan-templates - Create Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should create a template from an existing plan',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
            planId: plan.id,
          });

          expect(status).toBe(201);
          const template = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(template.userId).toBe(userId);
          expect(template.name).toBe(plan.name);
          expect(template.periodCount).toBe(3);
          expect(template.periods).toHaveLength(3);
          expect(template.lastUsedAt).toBeNull();

          const firstPeriod = template.periods[0]!;
          expect(firstPeriod.order).toBe(1);
          expect(firstPeriod.fastingDuration).toBe(16);
          expect(firstPeriod.eatingWindow).toBe(8);
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

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'POST', token, {
            planId: NON_EXISTENT_UUID,
          });

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
        const program = expectUnauthorizedNoToken(ENDPOINT, 'POST', { planId: NON_EXISTENT_UUID });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when token is invalid',
      async () => {
        const program = expectUnauthorizedInvalidToken(ENDPOINT, 'POST', { planId: NON_EXISTENT_UUID });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );

    test(
      'should return 401 when token is expired',
      async () => {
        const program = expectUnauthorizedExpiredToken(ENDPOINT, 'POST', { planId: NON_EXISTENT_UUID });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// GET /v1/plan-templates - List Plan Templates
// ============================================================================

describe('GET /v1/plan-templates - List Plan Templates', () => {
  describe('Success Scenarios', () => {
    test(
      'should return empty list for new user',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'GET', token);

          expect(status).toBe(200);
          const templates = yield* S.decodeUnknown(PlanTemplatesListResponseSchema)(json);
          expect(templates).toHaveLength(0);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return templates for user with templates',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);

          // Create 2 templates from the same plan
          yield* createTemplateForUser(token, plan.id);
          yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(ENDPOINT, 'GET', token);

          expect(status).toBe(200);
          const templates = yield* S.decodeUnknown(PlanTemplatesListResponseSchema)(json);
          expect(templates).toHaveLength(2);
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
// GET /v1/plan-templates/:id - Get Plan Template
// ============================================================================

describe('GET /v1/plan-templates/:id - Get Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should return a template with periods',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'GET', token);

          expect(status).toBe(200);
          const fetched = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(fetched.id).toBe(template.id);
          expect(fetched.userId).toBe(userId);
          expect(fetched.name).toBe(template.name);
          expect(fetched.periods).toHaveLength(3);
          expect(fetched.periodCount).toBe(3);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 for non-existent template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET', token);

          expectTemplateNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 404 when template belongs to another user',
      async () => {
        const program = Effect.gen(function* () {
          // User A creates a template
          const { token: tokenA } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(tokenA);
          const template = yield* createTemplateForUser(tokenA, plan.id);

          // User B tries to access it
          const { token: tokenB } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'GET', tokenB);

          expectTemplateNotFoundError(status, json);
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
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'GET');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// PATCH /v1/plan-templates/:id - Update Plan Template
// ============================================================================

describe('PATCH /v1/plan-templates/:id - Update Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should update template name only',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'PATCH', token, {
            name: 'Updated Name',
          });

          expect(status).toBe(200);
          const updated = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(updated.name).toBe('Updated Name');
          expect(updated.periods).toHaveLength(3);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should update template description',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'PATCH', token, {
            description: 'New description',
          });

          expect(status).toBe(200);
          const updated = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(updated.description).toBe('New description');
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should replace periods with different count and values',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          expect(template.periods).toHaveLength(3);

          const newPeriods = [
            { fastingDuration: 20, eatingWindow: 4 },
            { fastingDuration: 18, eatingWindow: 6 },
          ];

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'PATCH', token, {
            periods: newPeriods,
          });

          expect(status).toBe(200);
          const updated = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(updated.periods).toHaveLength(2);
          expect(updated.periodCount).toBe(2);
          expect(updated.periods[0]!.fastingDuration).toBe(20);
          expect(updated.periods[0]!.eatingWindow).toBe(4);
          expect(updated.periods[1]!.fastingDuration).toBe(18);
          expect(updated.periods[1]!.eatingWindow).toBe(6);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should update name and periods together',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'PATCH', token, {
            name: 'Combined Update',
            periods: [{ fastingDuration: 24, eatingWindow: 4 }],
          });

          expect(status).toBe(200);
          const updated = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(updated.name).toBe('Combined Update');
          expect(updated.periods).toHaveLength(1);
          expect(updated.periodCount).toBe(1);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 for non-existent template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'PATCH', token, {
            name: 'Updated',
          });

          expectTemplateNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Invalid Period Count (400)', () => {
    test(
      'should return 400 when periods array is empty',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'PATCH', token, {
            periods: [],
          });

          // Empty periods array fails schema validation (minItems: 1)
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
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'PATCH', { name: 'Test' });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// DELETE /v1/plan-templates/:id - Delete Plan Template
// ============================================================================

describe('DELETE /v1/plan-templates/:id - Delete Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should delete a template and subsequent GET returns 404',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          // Delete the template
          const { status } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'DELETE', token);
          expect(status).toBe(204);

          // Verify it's gone
          const { status: getStatus, json: getJson } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${template.id}`,
            'GET',
            token,
          );

          expectTemplateNotFoundError(getStatus, getJson);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 for non-existent template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${NON_EXISTENT_UUID}`, 'DELETE', token);

          expectTemplateNotFoundError(status, json);
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

// ============================================================================
// POST /v1/plan-templates/:id/duplicate - Duplicate Plan Template
// ============================================================================

describe('POST /v1/plan-templates/:id/duplicate - Duplicate Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should create a copy with " (copy)" suffix and same periods',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${template.id}/duplicate`,
            'POST',
            token,
          );

          expect(status).toBe(201);
          const duplicate = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(duplicate.id).not.toBe(template.id);
          expect(duplicate.userId).toBe(userId);
          expect(duplicate.name).toBe(`${template.name} (copy)`);
          expect(duplicate.periods).toHaveLength(template.periods.length);
          expect(duplicate.periodCount).toBe(template.periodCount);

          // Verify periods have same values
          for (let i = 0; i < template.periods.length; i++) {
            expect(duplicate.periods[i]!.fastingDuration).toBe(template.periods[i]!.fastingDuration);
            expect(duplicate.periods[i]!.eatingWindow).toBe(template.periods[i]!.eatingWindow);
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 for non-existent template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${NON_EXISTENT_UUID}/duplicate`,
            'POST',
            token,
          );

          expectTemplateNotFoundError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Limit Reached (409)', () => {
    test(
      'should return 409 when template limit is reached',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const firstTemplate = yield* createTemplateForUser(token, plan.id);

          // Fill up to the limit (already created 1)
          for (let i = 1; i < MAX_PLAN_TEMPLATES; i++) {
            yield* createTemplateForUser(token, plan.id);
          }

          // Attempt to duplicate should fail with limit reached
          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${firstTemplate.id}/duplicate`,
            'POST',
            token,
          );

          expectTemplateLimitReachedError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 60000 },
    );
  });

  describe('Error Scenarios - Authentication (401)', () => {
    test(
      'should return 401 when no token is provided',
      async () => {
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/duplicate`, 'POST');
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});

// ============================================================================
// POST /v1/plan-templates/:id/apply - Apply Plan Template
// ============================================================================

describe('POST /v1/plan-templates/:id/apply - Apply Plan Template', () => {
  describe('Success Scenarios', () => {
    test(
      'should create a plan from a template',
      async () => {
        const program = Effect.gen(function* () {
          const { userId, token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          // Cancel the current plan so we can apply the template
          yield* makeAuthenticatedRequest(`${PLANS_ENDPOINT}/${plan.id}/cancel`, 'POST', token);

          const startDate = new Date();
          startDate.setDate(startDate.getDate() + 1);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}/apply`, 'POST', token, {
            startDate: startDate.toISOString(),
          });

          expect(status).toBe(201);
          const newPlan = yield* S.decodeUnknown(PlanWithPeriodsResponseSchema)(json);
          expect(newPlan.userId).toBe(userId);
          expect(newPlan.status).toBe('InProgress');
          expect(newPlan.periods).toHaveLength(template.periods.length);

          // Verify period values match template
          for (let i = 0; i < template.periods.length; i++) {
            expect(newPlan.periods[i]!.fastingDuration).toBe(template.periods[i]!.fastingDuration);
            expect(newPlan.periods[i]!.eatingWindow).toBe(template.periods[i]!.eatingWindow);
          }
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should update lastUsedAt after applying template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          expect(template.lastUsedAt).toBeNull();

          // Cancel the current plan so we can apply the template
          yield* makeAuthenticatedRequest(`${PLANS_ENDPOINT}/${plan.id}/cancel`, 'POST', token);

          const startDate = new Date();
          startDate.setDate(startDate.getDate() + 1);

          yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}/apply`, 'POST', token, {
            startDate: startDate.toISOString(),
          });

          // Fetch the template again and verify lastUsedAt is set
          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}`, 'GET', token);

          expect(status).toBe(200);
          const updated = yield* S.decodeUnknown(PlanTemplateWithPeriodsResponseSchema)(json);
          expect(updated.lastUsedAt).not.toBeNull();
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );
  });

  describe('Error Scenarios - Not Found (404)', () => {
    test(
      'should return 404 for non-existent template',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          const { status, json } = yield* makeAuthenticatedRequest(
            `${ENDPOINT}/${NON_EXISTENT_UUID}/apply`,
            'POST',
            token,
            { startDate: new Date().toISOString() },
          );

          expectTemplateNotFoundError(status, json);
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
          const plan = yield* createPlanForUser(token);
          const template = yield* createTemplateForUser(token, plan.id);

          // User has an active plan, applying template should fail
          const startDate = new Date();
          startDate.setDate(startDate.getDate() + 1);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}/apply`, 'POST', token, {
            startDate: startDate.toISOString(),
          });

          expectPlanAlreadyActiveError(status, json);
        }).pipe(Effect.provide(DatabaseLive));

        await Effect.runPromise(program);
      },
      { timeout: 15000 },
    );

    test(
      'should return 409 when user has an active cycle',
      async () => {
        const program = Effect.gen(function* () {
          const { token } = yield* createTestUserWithTracking();

          // Create a plan far in the past to avoid overlap with the cycle
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - 30);
          const plan = yield* createPlanForUser(token, {
            name: 'Past Plan',
            startDate: pastDate.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          });
          const template = yield* createTemplateForUser(token, plan.id);

          // Cancel the plan so we can create a cycle
          yield* makeAuthenticatedRequest(`${PLANS_ENDPOINT}/${plan.id}/cancel`, 'POST', token);

          // Create an active cycle (current time, no overlap with past plan periods)
          const now = new Date();
          const cycleStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
          const cycleEnd = new Date(now.getTime() + 14 * 60 * 60 * 1000);
          const { status: cycleStatus, json: cycleJson } = yield* makeAuthenticatedRequest(
            CYCLES_ENDPOINT,
            'POST',
            token,
            {
              startDate: cycleStart.toISOString(),
              endDate: cycleEnd.toISOString(),
            },
          );

          if (cycleStatus !== 201) {
            throw new Error(`Failed to create cycle: ${cycleStatus} - ${JSON.stringify(cycleJson)}`);
          }

          const startDate = new Date();
          startDate.setDate(startDate.getDate() + 1);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}/apply`, 'POST', token, {
            startDate: startDate.toISOString(),
          });

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

          // Create a plan far in the past to avoid overlap
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - 30);
          const plan = yield* createPlanForUser(token, {
            name: 'Past Plan',
            startDate: pastDate.toISOString(),
            periods: [{ fastingDuration: 16, eatingWindow: 8 }],
          });
          const template = yield* createTemplateForUser(token, plan.id);

          // Cancel the plan
          yield* makeAuthenticatedRequest(`${PLANS_ENDPOINT}/${plan.id}/cancel`, 'POST', token);

          // Create and complete a cycle (5-3 days ago)
          yield* createCompletedCycleForUser(token, 5, 3);

          // Apply template with a startDate that overlaps the completed cycle (4 days ago)
          const now = new Date();
          const overlappingStartDate = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

          const { status, json } = yield* makeAuthenticatedRequest(`${ENDPOINT}/${template.id}/apply`, 'POST', token, {
            startDate: overlappingStartDate.toISOString(),
          });

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
        const program = expectUnauthorizedNoToken(`${ENDPOINT}/${NON_EXISTENT_UUID}/apply`, 'POST', {
          startDate: new Date().toISOString(),
        });
        await Effect.runPromise(program.pipe(Effect.provide(DatabaseLive)));
      },
      { timeout: 15000 },
    );
  });
});
