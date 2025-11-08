import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Layer, Option, Stream } from 'effect';
import { DatabaseLive } from '../../../../db';
import { RedisLive } from '../../../../db/providers/redis/connection';
import { createTestUser, deleteTestUser, validateJwtSecret } from '../../../../test-utils';
import { CycleRepository, CycleRepositoryPostgres } from '../../repositories';
import { CycleCompletionCache } from '../cycle-completion-cache.service';

validateJwtSecret();

const ServiceLayers = Layer.mergeAll(
  CycleRepositoryPostgres.Default, // Needs PgDrizzle, provides CycleRepository
  CycleCompletionCache.Default, // Needs CycleRepository, provides CycleCompletionCache
);

// Use provideMerge to share infrastructure layers between services and test utilities
// This ensures a single Database/Redis instance is shared across everything
const TestLayers = ServiceLayers.pipe(Layer.provideMerge(Layer.mergeAll(DatabaseLive, RedisLive)));

const testData = {
  userIds: new Set<string>(),
};

afterAll(async () => {
  console.log('\n🧹 Starting CycleCompletionCache test cleanup...');
  console.log(`📊 Tracked test users: ${testData.userIds.size}`);

  if (testData.userIds.size === 0) {
    console.log('⚠️  No test data to clean up');
    return;
  }

  const cleanupProgram = Effect.gen(function* () {
    const cycleCompletionCache = yield* CycleCompletionCache;
    const userIdsArray = Array.from(testData.userIds);

    // Invalidate all cache entries for test users
    yield* cycleCompletionCache.invalidateAll();

    // Delete test users
    yield* Effect.all(
      userIdsArray.map((userId) => deleteTestUser(userId)),
      { concurrency: 'unbounded' },
    );

    console.log(`✅ Deleted ${testData.userIds.size} test users and cleared cache`);
    console.log('✅ CycleCompletionCache test cleanup completed successfully\n');
  }).pipe(
    Effect.provide(TestLayers),
    Effect.scoped,
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('⚠️  CycleCompletionCache test cleanup failed:', error);
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

const createCompletedCycleForUser = (userId: string, endDate: Date) =>
  Effect.gen(function* () {
    const repository = yield* CycleRepository;

    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 1 day before

    // Create and complete cycle
    const cycle = yield* repository.createCycle({
      userId,
      status: 'InProgress',
      startDate,
      endDate,
    });

    return yield* repository.completeCycle(userId, cycle.id, startDate, endDate);
  });

describe('CycleCompletionCache - Core Operations', () => {
  test(
    'getLastCompletionDate - returns Option.none for users with no completed cycles',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const result = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'getLastCompletionDate - cache miss on first access (loads from DB)',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const endDate = new Date('2025-11-01T20:00:00.000Z');
        yield* createCompletedCycleForUser(userId, endDate);

        // First access - cache miss, should load from DB
        const result = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.toISOString()).toBe(endDate.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'getLastCompletionDate - cache hit on second access (no DB query)',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const endDate = new Date('2025-11-02T20:00:00.000Z');
        yield* createCompletedCycleForUser(userId, endDate);

        // First access - loads from DB
        const first = yield* cycleCompletionCache.getLastCompletionDate(userId);

        // Second access - should hit cache
        const second = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isSome(first)).toBe(true);
        expect(Option.isSome(second)).toBe(true);

        if (Option.isSome(first) && Option.isSome(second)) {
          expect(first.value.toISOString()).toBe(second.value.toISOString());
          expect(second.value.toISOString()).toBe(endDate.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'setLastCompletionDate - updates cache with new completion date',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const newEndDate = new Date('2025-11-03T20:00:00.000Z');

        // Set new completion date
        yield* cycleCompletionCache.setLastCompletionDate(userId, newEndDate);

        // Retrieve and verify
        const result = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.toISOString()).toBe(newEndDate.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'setLastCompletionDate - updates existing cache entry',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const firstDate = new Date('2025-11-04T20:00:00.000Z');
        const secondDate = new Date('2025-11-05T20:00:00.000Z');

        // Set first date
        yield* cycleCompletionCache.setLastCompletionDate(userId, firstDate);

        // Update with second date
        yield* cycleCompletionCache.setLastCompletionDate(userId, secondDate);

        // Verify it was updated
        const result = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.toISOString()).toBe(secondDate.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );
});

describe('CycleCompletionCache - Cache Invalidation', () => {
  test(
    'invalidate - removes user cache entry',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const endDate = new Date('2025-11-06T20:00:00.000Z');

        // Create completed cycle and populate cache
        yield* createCompletedCycleForUser(userId, endDate);
        yield* cycleCompletionCache.getLastCompletionDate(userId); // Load into cache

        // Invalidate cache
        yield* cycleCompletionCache.invalidate(userId);

        // Next access should reload from DB
        const result = yield* cycleCompletionCache.getLastCompletionDate(userId);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.toISOString()).toBe(endDate.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'invalidateAll - clears entire cache',
    async () => {
      const program = Effect.gen(function* () {
        const user1 = yield* createTestUserWithTracking();
        const user2 = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const endDate1 = new Date('2025-11-07T20:00:00.000Z');
        const endDate2 = new Date('2025-11-08T20:00:00.000Z');

        // Create completed cycles and populate cache for both users
        yield* createCompletedCycleForUser(user1.userId, endDate1);
        yield* createCompletedCycleForUser(user2.userId, endDate2);

        yield* cycleCompletionCache.getLastCompletionDate(user1.userId);
        yield* cycleCompletionCache.getLastCompletionDate(user2.userId);

        // Invalidate all
        yield* cycleCompletionCache.invalidateAll();

        // Next accesses should reload from DB
        const result1 = yield* cycleCompletionCache.getLastCompletionDate(user1.userId);
        const result2 = yield* cycleCompletionCache.getLastCompletionDate(user2.userId);

        expect(Option.isSome(result1)).toBe(true);
        expect(Option.isSome(result2)).toBe(true);

        if (Option.isSome(result1) && Option.isSome(result2)) {
          expect(result1.value.toISOString()).toBe(endDate1.toISOString());
          expect(result2.value.toISOString()).toBe(endDate2.toISOString());
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );
});

describe('CycleCompletionCache - Reactive Subscriptions', () => {
  test(
    'subscribeToChanges - emits current value first when no completed cycles',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const stream = yield* cycleCompletionCache.subscribeToChanges(userId);

        // Get first emitted value
        const firstValue = yield* Stream.runHead(stream);

        expect(Option.isSome(firstValue)).toBe(true);
        if (Option.isSome(firstValue)) {
          // First value should be Option.none (no completed cycles)
          expect(Option.isNone(firstValue.value)).toBe(true);
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );

  test(
    'subscribeToChanges - emits current value first when completed cycle exists',
    async () => {
      const program = Effect.gen(function* () {
        const { userId } = yield* createTestUserWithTracking();
        const cycleCompletionCache = yield* CycleCompletionCache;

        const endDate = new Date('2025-11-09T20:00:00.000Z');
        yield* createCompletedCycleForUser(userId, endDate);

        const stream = yield* cycleCompletionCache.subscribeToChanges(userId);

        // Get first emitted value
        const firstValue = yield* Stream.runHead(stream);

        expect(Option.isSome(firstValue)).toBe(true);
        if (Option.isSome(firstValue)) {
          const dateOption = firstValue.value;
          expect(Option.isSome(dateOption)).toBe(true);
          if (Option.isSome(dateOption)) {
            expect(dateOption.value.toISOString()).toBe(endDate.toISOString());
          }
        }
      }).pipe(Effect.provide(TestLayers), Effect.scoped);

      await Effect.runPromise(program);
    },
    { timeout: 15000 },
  );
});
