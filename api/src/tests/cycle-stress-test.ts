import { Console, Duration, Effect } from 'effect';
import { DatabaseLive } from '../db';
import { createTestUser, deleteTestUser } from '../test-utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Number of concurrent users to simulate (adjust this to scale the test)
  numUsers: 1000,
  baseUrl: 'http://localhost:3000',
};

// ============================================================================
// TEST DATA TRACKING
// ============================================================================

const testData = {
  userIds: new Set<string>(),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate valid past dates for cycle operations
 * Creates dates ensuring endDate > startDate with at least 1 hour duration
 */
const generatePastDates = (daysAgo: number = 2) => {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneHourMs = 60 * 60 * 1000;

  const startDate = new Date(now - daysAgo * oneDayMs);
  const endDate = new Date(startDate.getTime() + 2 * oneHourMs); // 2 hours duration

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

/**
 * Create a test user with valid token
 */
const createUser = (index: number) =>
  Effect.gen(function* () {
    const user = yield* createTestUser();
    testData.userIds.add(user.userId); // Track for cleanup
    yield* Console.log(`[User ${index}] 👤 Created userId: ${user.userId}`);
    return { userId: user.userId, token: user.token, index };
  });

/**
 * Make an authenticated HTTP request with error handling
 */
const makeAuthenticatedRequest = <T>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
  userIndex?: number,
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      catch: (error) =>
        new Error(
          `[User ${userIndex ?? '?'}] Request failed: ${method} ${url} - ${error}`,
        ),
    });

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () =>
        new Error(
          `[User ${userIndex ?? '?'}] Failed to parse JSON for ${method} ${url}`,
        ),
    });

    return {
      status: response.status,
      data,
    };
  });

// ============================================================================
// CYCLE OPERATIONS
// ============================================================================

/**
 * Create a new cycle for a user
 */
const createCycle = (userId: string, token: string, userIndex: number) =>
  Effect.gen(function* () {
    const dates = generatePastDates(2);
    const url = `${CONFIG.baseUrl}/v1/cycles`;

    yield* Console.log(`[User ${userIndex}] 🔄 Creating cycle...`);

    const result = yield* makeAuthenticatedRequest(
      'POST',
      url,
      token,
      {
        startDate: dates.startDate,
        endDate: dates.endDate,
      },
      userIndex,
    );

    if (result.status >= 200 && result.status < 300) {
      yield* Console.log(
        `[User ${userIndex}] ✅ Cycle created - ID: ${(result.data as any).id}`,
      );
    } else {
      yield* Console.log(
        `[User ${userIndex}] ❌ Create failed - Status: ${result.status}`,
      );
    }

    return {
      operation: 'create',
      userId,
      userIndex,
      status: result.status,
      cycleId: result.status >= 200 && result.status < 300 ? (result.data as any).id : null,
      data: result.data,
    };
  });

/**
 * Update an existing cycle's dates
 */
const updateCycle = (userId: string, cycleId: string, token: string, userIndex: number) =>
  Effect.gen(function* () {
    const dates = generatePastDates(3); // Different dates
    const url = `${CONFIG.baseUrl}/v1/cycles/${cycleId}`;

    yield* Console.log(`[User ${userIndex}] 🔄 Updating cycle ${cycleId}...`);

    const result = yield* makeAuthenticatedRequest(
      'PATCH',
      url,
      token,
      {
        startDate: dates.startDate,
        endDate: dates.endDate,
      },
      userIndex,
    );

    if (result.status >= 200 && result.status < 300) {
      yield* Console.log(`[User ${userIndex}] ✅ Cycle updated successfully`);
    } else {
      yield* Console.log(
        `[User ${userIndex}] ❌ Update failed - Status: ${result.status}`,
      );
    }

    return {
      operation: 'update',
      userId,
      userIndex,
      cycleId,
      status: result.status,
      data: result.data,
    };
  });

/**
 * Complete a cycle
 */
const completeCycle = (userId: string, cycleId: string, token: string, userIndex: number) =>
  Effect.gen(function* () {
    const dates = generatePastDates(3);
    const url = `${CONFIG.baseUrl}/v1/cycles/${cycleId}/complete`;

    yield* Console.log(`[User ${userIndex}] 🔄 Completing cycle ${cycleId}...`);

    const result = yield* makeAuthenticatedRequest(
      'POST',
      url,
      token,
      {
        startDate: dates.startDate,
        endDate: dates.endDate,
      },
      userIndex,
    );

    if (result.status >= 200 && result.status < 300) {
      yield* Console.log(`[User ${userIndex}] ✅ Cycle completed successfully`);
    } else {
      yield* Console.log(
        `[User ${userIndex}] ❌ Complete failed - Status: ${result.status}`,
      );
    }

    return {
      operation: 'complete',
      userId,
      userIndex,
      cycleId,
      status: result.status,
      data: result.data,
    };
  });

// ============================================================================
// COMPLETE USER FLOW
// ============================================================================

/**
 * Simulate a complete cycle flow for one user:
 * 1. Create cycle
 * 2. Update cycle
 * 3. Complete cycle
 */
const userCycleFlow = (userIndex: number) =>
  Effect.gen(function* () {
    yield* Console.log(`\n[User ${userIndex}] 🚀 Starting cycle flow...`);

    // Create user
    const user = yield* createUser(userIndex);

    // Track results
    const results: any[] = [];

    // 1. Create cycle
    const createResult = yield* createCycle(user.userId, user.token, userIndex).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({
          operation: 'create',
          userId: user.userId,
          userIndex,
          status: 500,
          error: String(error),
          cycleId: null,
        }),
      ),
    );
    results.push(createResult);

    // Only proceed if creation was successful
    if (createResult.status >= 200 && createResult.status < 300 && createResult.cycleId) {
      // 2. Update cycle
      const updateResult = yield* updateCycle(
        user.userId,
        createResult.cycleId,
        user.token,
        userIndex,
      ).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            operation: 'update',
            userId: user.userId,
            userIndex,
            cycleId: createResult.cycleId,
            status: 500,
            error: String(error),
          }),
        ),
      );
      results.push(updateResult);

      // 3. Complete cycle
      const completeResult = yield* completeCycle(
        user.userId,
        createResult.cycleId,
        user.token,
        userIndex,
      ).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            operation: 'complete',
            userId: user.userId,
            userIndex,
            cycleId: createResult.cycleId,
            status: 500,
            error: String(error),
          }),
        ),
      );
      results.push(completeResult);
    }

    yield* Console.log(`[User ${userIndex}] 🏁 Completed cycle flow`);

    return {
      userIndex,
      userId: user.userId,
      results,
    };
  });

// ============================================================================
// DATABASE CLEANUP
// ============================================================================

/**
 * Cleanup all test data from the database
 */
const cleanupTestData = () =>
  Effect.gen(function* () {
    console.log('\n🧹 Starting cleanup...');
    console.log(`📊 Tracked test users: ${testData.userIds.size}`);

    if (testData.userIds.size === 0) {
      console.log('⚠️  No test data to clean up');
      return;
    }

    const userIdsArray = Array.from(testData.userIds);

    // Delete all users and their cycles in parallel
    yield* Effect.all(userIdsArray.map((userId) => deleteTestUser(userId)), {
      concurrency: 'unbounded',
    });

    console.log(`✅ Deleted ${testData.userIds.size} test users and their cycles`);
  });

// ============================================================================
// STATISTICS AND REPORTING
// ============================================================================

interface OperationResult {
  operation: 'create' | 'update' | 'complete';
  status: number;
  error?: string;
}

interface UserFlowResult {
  userIndex: number;
  userId: string;
  results: OperationResult[];
}

const generateStatistics = (results: UserFlowResult[], duration: Duration.Duration) => {
  const stats = {
    totalUsers: results.length,
    totalOperations: 0,
    operations: {
      create: { total: 0, success: 0, failed: 0, errors: {} as Record<number, number> },
      update: { total: 0, success: 0, failed: 0, errors: {} as Record<number, number> },
      complete: { total: 0, success: 0, failed: 0, errors: {} as Record<number, number> },
    },
  };

  results.forEach((userResult) => {
    userResult.results.forEach((opResult) => {
      const op = stats.operations[opResult.operation];
      op.total++;
      stats.totalOperations++;

      if (opResult.status >= 200 && opResult.status < 300) {
        op.success++;
      } else {
        op.failed++;
        op.errors[opResult.status] = (op.errors[opResult.status] || 0) + 1;
      }
    });
  });

  return {
    stats,
    duration: {
      milliseconds: Duration.toMillis(duration),
      seconds: Duration.toSeconds(duration),
    },
  };
};

const printStatistics = (results: UserFlowResult[], duration: Duration.Duration) => {
  const { stats, duration: durationStats } = generateStatistics(results, duration);

  console.log('\n' + '='.repeat(80));
  console.log('📊 STRESS TEST RESULTS');
  console.log('='.repeat(80));

  console.log(`\n⏱️  Total execution time: ${durationStats.milliseconds}ms (${durationStats.seconds.toFixed(2)}s)`);
  console.log(`👥 Total users simulated: ${stats.totalUsers}`);
  console.log(`🔄 Total operations: ${stats.totalOperations}`);
  console.log(`⚡ Average time per operation: ${(durationStats.milliseconds / stats.totalOperations).toFixed(2)}ms`);

  console.log('\n📈 Operations Breakdown:');

  Object.entries(stats.operations).forEach(([operation, data]) => {
    console.log(`\n  ${operation.toUpperCase()}:`);
    console.log(`    Total: ${data.total}`);
    console.log(`    ✅ Success: ${data.success} (${((data.success / data.total) * 100).toFixed(1)}%)`);
    console.log(`    ❌ Failed: ${data.failed} (${((data.failed / data.total) * 100).toFixed(1)}%)`);

    if (Object.keys(data.errors).length > 0) {
      console.log('    Error distribution:');
      Object.entries(data.errors)
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([status, count]) => {
          console.log(`      HTTP ${status}: ${count} occurrences`);
        });
    }
  });

  console.log('\n' + '='.repeat(80));
};

// ============================================================================
// MAIN PROGRAM
// ============================================================================

const program = Effect.gen(function* () {
  console.log('🚀 Starting Cycle Stress Test');
  console.log(`👥 Simulating ${CONFIG.numUsers} concurrent users\n`);
  console.log('Each user will:');
  console.log('  1. Create a cycle');
  console.log('  2. Update the cycle');
  console.log('  3. Complete the cycle\n');

  // Create array of user flows
  const userFlows = Array.from({ length: CONFIG.numUsers }, (_, i) => userCycleFlow(i + 1));

  // Execute all user flows in parallel with timing
  const results = yield* Effect.all(userFlows, {
    concurrency: 'unbounded', // Change to a number (e.g., 10) to limit concurrency
  }).pipe(Effect.timed);

  const [duration, data] = results;

  // Print statistics
  printStatistics(data, duration);

  // Cleanup database
  console.log('\n🧹 Cleaning up test data...');
  yield* cleanupTestData();

  return data;
}).pipe(Effect.provide(DatabaseLive));

// Run the program
const main = Effect.catchAll(program, (error) =>
  Effect.gen(function* () {
    console.error('\n❌ Stress test failed:', error);
    // Still try to cleanup
    yield* cleanupTestData().pipe(
      Effect.catchAll(() => Effect.void),
    );
    yield* Effect.fail(error);
  }).pipe(Effect.provide(DatabaseLive)),
);

Effect.runPromise(main)
  .then(() => {
    console.log('\n✨ Stress test completed successfully');
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });

// ============================================================================
// USAGE
// ============================================================================
// Run with: bun run api/src/tests/cycle-stress-test.ts
//
// To change the number of concurrent users, modify CONFIG.numUsers at the top
// To limit concurrency, change 'unbounded' to a number in the Effect.all call
//
// Requirements:
// - Server must be running on http://localhost:3000
// - TEST_JWT_TOKEN environment variable must be set
// - Database must be accessible
