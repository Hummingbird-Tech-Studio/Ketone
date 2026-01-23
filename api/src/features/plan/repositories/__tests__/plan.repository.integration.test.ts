import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer, Option } from 'effect';
import { DatabaseLive } from '../../../../db';
import { createTestUser, deleteTestUser } from '../../../../test-utils';
import { PlanRepository, PlanRepositoryLive, type PeriodData } from '../index';
import { CycleRepository, CycleRepositoryLive } from '../../../cycle/repositories';
import {
  PlanAlreadyActiveError,
  ActiveCycleExistsError,
  PlanNotFoundError,
  PlanInvalidStateError,
  InvalidPeriodCountError,
} from '../../domain';

const TestLayers = Layer.mergeAll(PlanRepositoryLive, CycleRepositoryLive, DatabaseLive);

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting PlanRepository test cleanup...');
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
    console.log('✅ PlanRepository test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(DatabaseLive),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  PlanRepository test cleanup failed:', error);
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
 * Generate valid period data for testing
 */
const generatePeriodData = (count: number, startDate: Date): PeriodData[] => {
  const periods: PeriodData[] = [];
  let currentStart = new Date(startDate);

  for (let i = 1; i <= count; i++) {
    const fastingDuration = 16; // 16 hours fasting
    const eatingWindow = 8; // 8 hours eating
    const fastingDurationMs = fastingDuration * 60 * 60 * 1000;
    const eatingWindowMs = eatingWindow * 60 * 60 * 1000;

    // Calculate explicit phase timestamps
    const fastingStartDate = new Date(currentStart);
    const fastingEndDate = new Date(currentStart.getTime() + fastingDurationMs);
    const eatingStartDate = new Date(fastingEndDate);
    const eatingEndDate = new Date(eatingStartDate.getTime() + eatingWindowMs);

    periods.push({
      order: i,
      fastingDuration,
      eatingWindow,
      startDate: currentStart,
      endDate: eatingEndDate,
      fastingStartDate,
      fastingEndDate,
      eatingStartDate,
      eatingEndDate,
    });

    currentStart = new Date(eatingEndDate);
  }

  return periods;
};

/**
 * Generate a start date for a plan (tomorrow)
 */
const generatePlanStartDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  return tomorrow;
};

describe('PlanRepository', () => {
  describe('createPlan', () => {
    test('should create a plan with periods successfully', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(3, startDate);

        const result = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        expect(result.userId).toBe(userId);
        expect(result.status).toBe('InProgress');
        expect(result.name).toBe('Test Plan');
        expect(result.description).toBeNull();
        expect(result.periods).toHaveLength(3);
        expect(result.periods[0]!.order).toBe(1);
        expect(result.periods[1]!.order).toBe(2);
        expect(result.periods[2]!.order).toBe(3);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should create a plan with name and description', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);

        const result = yield* planRepository.createPlan(
          userId,
          startDate,
          periods,
          'My Fasting Plan',
          'A 16:8 intermittent fasting plan for weight loss',
        );

        expect(result.userId).toBe(userId);
        expect(result.name).toBe('My Fasting Plan');
        expect(result.description).toBe('A 16:8 intermittent fasting plan for weight loss');
        expect(result.status).toBe('InProgress');
        expect(result.periods).toHaveLength(2);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when user already has an active plan', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);

        // Create first plan
        yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        // Try to create second plan - should fail
        const result = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan').pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(PlanAlreadyActiveError);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when user has an active standalone cycle', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;
        const cycleRepository = yield* CycleRepository;

        // Create an active cycle
        const now = new Date();
        const cycleStartDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
        const cycleEndDate = new Date(now.getTime() + 14 * 60 * 60 * 1000); // 14 hours from now

        yield* cycleRepository.createCycle({
          userId,
          status: 'InProgress',
          startDate: cycleStartDate,
          endDate: cycleEndDate,
        });

        // Try to create a plan - should fail
        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);

        const result = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan').pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(ActiveCycleExistsError);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when periods array is empty', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods: PeriodData[] = []; // Empty array

        const result = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan').pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(InvalidPeriodCountError);
          if (result.left instanceof InvalidPeriodCountError) {
            expect(result.left.periodCount).toBe(0);
            expect(result.left.minPeriods).toBe(1);
            expect(result.left.maxPeriods).toBe(31);
          }
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when periods array exceeds maximum (31)', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(32, startDate); // 32 periods - exceeds max

        const result = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan').pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(InvalidPeriodCountError);
          if (result.left instanceof InvalidPeriodCountError) {
            expect(result.left.periodCount).toBe(32);
            expect(result.left.minPeriods).toBe(1);
            expect(result.left.maxPeriods).toBe(31);
          }
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getPlanById', () => {
    test('should return the plan when it exists', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.getPlanById(userId, created.id);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(created.id);
          expect(result.value.userId).toBe(userId);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return None when plan does not exist', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.getPlanById(userId, '00000000-0000-0000-0000-000000000000');

        expect(Option.isNone(result)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return None when plan belongs to different user', async () => {
      const program = Effect.gen(function* () {
        const { userId: userId1 } = yield* createTestUserWithTracking();
        const { userId: userId2 } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId1, startDate, periods, 'Test Plan');

        // Try to get plan as different user
        const result = yield* planRepository.getPlanById(userId2, created.id);

        expect(Option.isNone(result)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getPlanWithPeriods', () => {
    test('should return plan with all periods', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(5, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.getPlanWithPeriods(userId, created.id);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(created.id);
          expect(result.value.periods).toHaveLength(5);
          expect(result.value.periods[0]!.order).toBe(1);
          expect(result.value.periods[4]!.order).toBe(5);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getActivePlan', () => {
    test('should return active plan for user', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.getActivePlan(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(created.id);
          expect(result.value.status).toBe('InProgress');
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return None when user has no active plan', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.getActivePlan(userId);

        expect(Option.isNone(result)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return None when user only has completed plans', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        // Complete the plan
        yield* planRepository.updatePlanStatus(userId, created.id, 'Completed');

        const result = yield* planRepository.getActivePlan(userId);

        expect(Option.isNone(result)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('updatePlanStatus', () => {
    test('should update plan status from active to completed', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const updated = yield* planRepository.updatePlanStatus(userId, created.id, 'Completed');

        expect(updated.status).toBe('Completed');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should update plan status from active to cancelled', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const updated = yield* planRepository.updatePlanStatus(userId, created.id, 'Cancelled');

        expect(updated.status).toBe('Cancelled');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when plan does not exist', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository
          .updatePlanStatus(userId, '00000000-0000-0000-0000-000000000000', 'Completed')
          .pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(PlanNotFoundError);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should fail when plan is not active', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        // Complete the plan first
        yield* planRepository.updatePlanStatus(userId, created.id, 'Completed');

        // Try to update again - should fail
        const result = yield* planRepository.updatePlanStatus(userId, created.id, 'Cancelled').pipe(Effect.either);

        expect(result._tag).toBe('Left');
        if (result._tag === 'Left') {
          expect(result.left).toBeInstanceOf(PlanInvalidStateError);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getPlanPeriods', () => {
    test('should return periods ordered by order field', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(4, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.getPlanPeriods(created.id);

        expect(result).toHaveLength(4);
        expect(result[0]!.order).toBe(1);
        expect(result[1]!.order).toBe(2);
        expect(result[2]!.order).toBe(3);
        expect(result[3]!.order).toBe(4);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return empty array for non-existent plan', async () => {
      const program = Effect.gen(function* () {
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.getPlanPeriods('00000000-0000-0000-0000-000000000000');

        expect(result).toHaveLength(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('hasActivePlanOrCycle', () => {
    test('should return false for both when user has neither', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.hasActivePlanOrCycle(userId);

        expect(result.hasActivePlan).toBe(false);
        expect(result.hasActiveCycle).toBe(false);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return hasActivePlan true when user has active plan', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(2, startDate);
        yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.hasActivePlanOrCycle(userId);

        expect(result.hasActivePlan).toBe(true);
        expect(result.hasActiveCycle).toBe(false);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return hasActiveCycle true when user has active cycle', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;
        const cycleRepository = yield* CycleRepository;

        const now = new Date();
        yield* cycleRepository.createCycle({
          userId,
          status: 'InProgress',
          startDate: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 14 * 60 * 60 * 1000),
        });

        const result = yield* planRepository.hasActivePlanOrCycle(userId);

        expect(result.hasActivePlan).toBe(false);
        expect(result.hasActiveCycle).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getAllPlans', () => {
    test('should return all plans ordered by startDate descending', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        // Create first plan
        const startDate1 = generatePlanStartDate();
        const periods1 = generatePeriodData(2, startDate1);
        const plan1 = yield* planRepository.createPlan(userId, startDate1, periods1, 'Test Plan 1');

        // Complete first plan so we can create another
        yield* planRepository.updatePlanStatus(userId, plan1.id, 'Completed');

        // Create second plan with later start date
        const startDate2 = new Date(startDate1);
        startDate2.setDate(startDate2.getDate() + 7);
        const periods2 = generatePeriodData(2, startDate2);
        yield* planRepository.createPlan(userId, startDate2, periods2, 'Test Plan 2');

        const result = yield* planRepository.getAllPlans(userId);

        expect(result).toHaveLength(2);
        // Should be ordered by startDate descending (most recent first)
        expect(result[0]!.startDate.getTime()).toBeGreaterThan(result[1]!.startDate.getTime());
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return empty array when user has no plans', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.getAllPlans(userId);

        expect(result).toHaveLength(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('getActivePlanWithPeriods', () => {
    test('should return active plan with all periods', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const periods = generatePeriodData(4, startDate);
        const created = yield* planRepository.createPlan(userId, startDate, periods, 'Test Plan');

        const result = yield* planRepository.getActivePlanWithPeriods(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(created.id);
          expect(result.value.status).toBe('InProgress');
          expect(result.value.periods).toHaveLength(4);
        }
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should return None when no active plan exists', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const result = yield* planRepository.getActivePlanWithPeriods(userId);

        expect(Option.isNone(result)).toBe(true);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('deleteAllByUserId', () => {
    test('should delete all plans for user', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        // Create first plan
        const startDate1 = generatePlanStartDate();
        const periods1 = generatePeriodData(2, startDate1);
        const plan1 = yield* planRepository.createPlan(userId, startDate1, periods1, 'Test Plan 1');

        // Complete first plan
        yield* planRepository.updatePlanStatus(userId, plan1.id, 'Completed');

        // Create second plan
        const startDate2 = new Date(startDate1);
        startDate2.setDate(startDate2.getDate() + 7);
        const periods2 = generatePeriodData(2, startDate2);
        yield* planRepository.createPlan(userId, startDate2, periods2, 'Test Plan 2');

        // Delete all plans
        yield* planRepository.deleteAllByUserId(userId);

        // Verify all plans are deleted
        const result = yield* planRepository.getAllPlans(userId);
        expect(result).toHaveLength(0);
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });

  describe('constraint validation', () => {
    test('should enforce period order range (1-31)', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const fastingDuration = 16;
        const eatingWindow = 8;
        const fastingDurationMs = fastingDuration * 60 * 60 * 1000;
        const eatingWindowMs = eatingWindow * 60 * 60 * 1000;
        const fastingEndDate = new Date(startDate.getTime() + fastingDurationMs);
        const eatingEndDate = new Date(fastingEndDate.getTime() + eatingWindowMs);

        const invalidPeriods: PeriodData[] = [
          {
            order: 0, // Invalid: should be >= 1
            fastingDuration,
            eatingWindow,
            startDate,
            endDate: eatingEndDate,
            fastingStartDate: startDate,
            fastingEndDate,
            eatingStartDate: fastingEndDate,
            eatingEndDate,
          },
        ];

        const result = yield* planRepository
          .createPlan(userId, startDate, invalidPeriods, 'Test Plan')
          .pipe(Effect.either);

        expect(result._tag).toBe('Left');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should enforce fasting duration range (1-168)', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const fastingDuration = 200; // Invalid: should be <= 168
        const eatingWindow = 8;
        const fastingDurationMs = fastingDuration * 60 * 60 * 1000;
        const eatingWindowMs = eatingWindow * 60 * 60 * 1000;
        const fastingEndDate = new Date(startDate.getTime() + fastingDurationMs);
        const eatingEndDate = new Date(fastingEndDate.getTime() + eatingWindowMs);

        const invalidPeriods: PeriodData[] = [
          {
            order: 1,
            fastingDuration,
            eatingWindow,
            startDate,
            endDate: eatingEndDate,
            fastingStartDate: startDate,
            fastingEndDate,
            eatingStartDate: fastingEndDate,
            eatingEndDate,
          },
        ];

        const result = yield* planRepository
          .createPlan(userId, startDate, invalidPeriods, 'Test Plan')
          .pipe(Effect.either);

        expect(result._tag).toBe('Left');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should enforce eating window range (1-24)', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const fastingDuration = 16;
        const eatingWindow = 30; // Invalid: should be <= 24
        const fastingDurationMs = fastingDuration * 60 * 60 * 1000;
        const eatingWindowMs = eatingWindow * 60 * 60 * 1000;
        const fastingEndDate = new Date(startDate.getTime() + fastingDurationMs);
        const eatingEndDate = new Date(fastingEndDate.getTime() + eatingWindowMs);

        const invalidPeriods: PeriodData[] = [
          {
            order: 1,
            fastingDuration,
            eatingWindow,
            startDate,
            endDate: eatingEndDate,
            fastingStartDate: startDate,
            fastingEndDate,
            eatingStartDate: fastingEndDate,
            eatingEndDate,
          },
        ];

        const result = yield* planRepository
          .createPlan(userId, startDate, invalidPeriods, 'Test Plan')
          .pipe(Effect.either);

        expect(result._tag).toBe('Left');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });

    test('should enforce endDate > startDate for periods', async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const planRepository = yield* PlanRepository;

        const startDate = generatePlanStartDate();
        const fastingDuration = 16;
        const eatingWindow = 8;
        const fastingDurationMs = fastingDuration * 60 * 60 * 1000;
        const eatingWindowMs = eatingWindow * 60 * 60 * 1000;
        const fastingEndDate = new Date(startDate.getTime() + fastingDurationMs);
        const eatingEndDate = new Date(fastingEndDate.getTime() + eatingWindowMs);

        const invalidPeriods: PeriodData[] = [
          {
            order: 1,
            fastingDuration,
            eatingWindow,
            startDate,
            endDate: new Date(startDate.getTime() - 60 * 60 * 1000), // Invalid: endDate before startDate
            fastingStartDate: startDate,
            fastingEndDate,
            eatingStartDate: fastingEndDate,
            eatingEndDate,
          },
        ];

        const result = yield* planRepository
          .createPlan(userId, startDate, invalidPeriods, 'Test Plan')
          .pipe(Effect.either);

        expect(result._tag).toBe('Left');
      });

      await Effect.runPromise(program.pipe(Effect.provide(TestLayers), Effect.scoped));
    });
  });
});
