import { Console, Duration, Effect } from 'effect';
import { DatabaseLive } from '../db';
import { createTestUser, deleteTestUser } from '../test-utils';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Number of concurrent users to simulate (adjust this to scale the test)
  numUsers: 2000,
  baseUrl: 'http://localhost:3000',
  // Concurrency limit for operations
  // 'unbounded' = no artificial limit (may cause batching due to server/OS limits)
  //               - Server HTTP connection limits (~100-500 concurrent)
  //               - OS file descriptor limits (macOS default: ~256)
  //               - Results in "batch" behavior: 100 ops → pause → 100 ops...
  // number (e.g., 100, 200) = max concurrent operations (recommended)
  //               - Prevents overwhelming the HTTP server
  //               - Smoother, continuous execution
  //               - Set based on your server's capacity
  // Note: With Neon's PgBouncer supporting 10k connections, DB is NOT the bottleneck
  concurrency: 'unbounded' as 'unbounded' | number,
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
const makeAuthenticatedRequest = <T>(method: string, url: string, token: string, body?: unknown, userIndex?: number) =>
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
      catch: (error) => new Error(`[User ${userIndex ?? '?'}] Request failed: ${method} ${url} - ${error}`),
    });

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: () => new Error(`[User ${userIndex ?? '?'}] Failed to parse JSON for ${method} ${url}`),
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
      yield* Console.log(`[User ${userIndex}] ✅ Cycle created - ID: ${(result.data as any).id}`);
    } else {
      yield* Console.log(`[User ${userIndex}] ❌ Create failed - Status: ${result.status}`);
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
      yield* Console.log(`[User ${userIndex}] ❌ Update failed - Status: ${result.status}`);
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
      yield* Console.log(`[User ${userIndex}] ❌ Complete failed - Status: ${result.status}`);
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

interface User {
  userId: string;
  token: string;
  index: number;
}

/**
 * Simulate a complete cycle flow for one user:
 * 1. Create cycle
 * 2. Update cycle
 * 3. Complete cycle
 */
const userCycleFlow = (user: User) =>
  Effect.gen(function* () {
    yield* Console.log(`\n[User ${user.index}] 🚀 Starting cycle flow...`);

    // Track results
    const results: any[] = [];

    // 1. Create cycle
    const createResult = yield* createCycle(user.userId, user.token, user.index).pipe(
      Effect.catchAll((error) =>
        Effect.succeed({
          operation: 'create',
          userId: user.userId,
          userIndex: user.index,
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
      const updateResult = yield* updateCycle(user.userId, createResult.cycleId, user.token, user.index).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            operation: 'update',
            userId: user.userId,
            userIndex: user.index,
            cycleId: createResult.cycleId,
            status: 500,
            error: String(error),
          }),
        ),
      );
      results.push(updateResult);

      // 3. Complete cycle
      const completeResult = yield* completeCycle(user.userId, createResult.cycleId, user.token, user.index).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            operation: 'complete',
            userId: user.userId,
            userIndex: user.index,
            cycleId: createResult.cycleId,
            status: 500,
            error: String(error),
          }),
        ),
      );
      results.push(completeResult);
    }

    yield* Console.log(`[User ${user.index}] 🏁 Completed cycle flow`);

    return {
      userIndex: user.index,
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
    yield* Effect.all(
      userIdsArray.map((userId) => deleteTestUser(userId)),
      {
        concurrency: CONFIG.concurrency,
      },
    );

    console.log(`✅ Deleted ${testData.userIds.size} test users and their cycles`);
  });

// ============================================================================
// TWO-PHASE STRESS TEST
// ============================================================================

/**
 * Phase 1: Sign Up - Create all test users concurrently
 */
const signUpPhase = (numUsers: number) =>
  Effect.gen(function* () {
    yield* Console.log('\n' + '='.repeat(80));
    yield* Console.log('📊 PHASE 1: USER SIGN UP');
    yield* Console.log('='.repeat(80));
    yield* Console.log(`\n👥 Creating ${numUsers} users concurrently...\n`);

    // Create array of user creation effects
    const userCreations = Array.from({ length: numUsers }, (_, i) => createUser(i + 1));

    // Execute all user creations in parallel with timing
    const result = yield* Effect.all(userCreations, {
      concurrency: CONFIG.concurrency,
    }).pipe(Effect.timed);

    const [duration, users] = result;

    // Print Phase 1 statistics
    const durationMs = Duration.toMillis(duration);
    const durationSec = Duration.toSeconds(duration);
    const rps = users.length / durationSec;

    yield* Console.log('\n' + '='.repeat(80));
    yield* Console.log(`⏱️  Sign up time: ${durationMs}ms (${durationSec.toFixed(2)}s)`);
    yield* Console.log(`👥 Users created: ${users.length}`);
    yield* Console.log(`⚡ Average per user: ${(durationMs / users.length).toFixed(2)}ms`);
    yield* Console.log(`🚀 Requests per second: ${rps.toFixed(2)} RPS`);
    yield* Console.log('='.repeat(80));

    return { users, duration };
  });

/**
 * Phase 2: Cycle Operations - Execute cycle operations for all users concurrently
 */
const cycleOperationsPhase = (users: User[]) =>
  Effect.gen(function* () {
    yield* Console.log('\n' + '='.repeat(80));
    yield* Console.log('📊 PHASE 2: CYCLE OPERATIONS');
    yield* Console.log('='.repeat(80));
    yield* Console.log(`\n🔄 Executing cycle operations for ${users.length} users...\n`);

    // Create array of user flow effects
    const userFlows = users.map((user) => userCycleFlow(user));

    // Execute all flows in parallel with timing
    const result = yield* Effect.all(userFlows, {
      concurrency: CONFIG.concurrency,
    }).pipe(Effect.timed);

    const [duration, results] = result;

    // Calculate statistics
    const durationMs = Duration.toMillis(duration);
    const durationSec = Duration.toSeconds(duration);

    const stats = {
      create: { total: 0, success: 0, failed: 0 },
      update: { total: 0, success: 0, failed: 0 },
      complete: { total: 0, success: 0, failed: 0 },
    };

    let totalOperations = 0;

    results.forEach((userResult) => {
      userResult.results.forEach((opResult: any) => {
        const op = stats[opResult.operation as keyof typeof stats];
        op.total++;
        totalOperations++;

        if (opResult.status >= 200 && opResult.status < 300) {
          op.success++;
        } else {
          op.failed++;
        }
      });
    });

    // Print Phase 2 statistics
    const rps = totalOperations / durationSec;

    yield* Console.log('\n' + '='.repeat(80));
    yield* Console.log(`⏱️  Operations time: ${durationMs}ms (${durationSec.toFixed(2)}s)`);
    yield* Console.log(`🔄 Total operations: ${totalOperations}`);
    yield* Console.log(`⚡ Average per operation: ${(durationMs / totalOperations).toFixed(2)}ms`);
    yield* Console.log(`🚀 Requests per second: ${rps.toFixed(2)} RPS`);
    yield* Console.log('\n📈 Operations Breakdown:');

    for (const [operation, data] of Object.entries(stats)) {
      const successRate = data.total > 0 ? ((data.success / data.total) * 100).toFixed(1) : '0.0';
      yield* Console.log(`  ${operation.toUpperCase()}: ${data.success}/${data.total} (${successRate}% success)`);
    }

    yield* Console.log('='.repeat(80));

    return { results, duration, stats, totalOperations };
  });

/**
 * Print final summary comparing both phases
 */
const printFinalSummary = (
  phase1Duration: Duration.Duration,
  phase2Duration: Duration.Duration,
  phase1Requests: number,
  phase2Requests: number,
) => {
  const phase1Ms = Duration.toMillis(phase1Duration);
  const phase2Ms = Duration.toMillis(phase2Duration);
  const totalMs = phase1Ms + phase2Ms;
  const totalSec = totalMs / 1000;

  const phase1Percentage = ((phase1Ms / totalMs) * 100).toFixed(1);
  const phase2Percentage = ((phase2Ms / totalMs) * 100).toFixed(1);

  // Calculate RPS
  const totalRequests = phase1Requests + phase2Requests;
  const overallRps = totalRequests / totalSec;

  // Create visual bars
  const maxBarLength = 40;
  const phase1BarLength = Math.round((phase1Ms / totalMs) * maxBarLength);
  const phase2BarLength = Math.round((phase2Ms / totalMs) * maxBarLength);

  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(
    `\nPhase 1 (Sign Up):     ${phase1Ms.toFixed(0).padStart(6)}ms (${phase1Percentage.padStart(5)}%)  ${'█'.repeat(
      phase1BarLength,
    )}`,
  );
  console.log(
    `Phase 2 (Cycles):      ${phase2Ms.toFixed(0).padStart(6)}ms (${phase2Percentage.padStart(5)}%)  ${'█'.repeat(
      phase2BarLength,
    )}`,
  );
  console.log(`                       ${'─'.repeat(15)}`);
  console.log(`Total time:            ${totalMs.toFixed(0).padStart(6)}ms (${totalSec.toFixed(2)}s)`);
  console.log(`Total requests:        ${totalRequests.toString().padStart(6)}`);
  console.log(`Overall RPS:           ${overallRps.toFixed(2).padStart(6)} requests/second`);
  console.log('='.repeat(80));
};

// ============================================================================
// MAIN PROGRAM
// ============================================================================

const program = Effect.gen(function* () {
  console.log('🚀 Starting Two-Phase Cycle Stress Test');
  console.log(`👥 Simulating ${CONFIG.numUsers} concurrent users`);
  console.log(
    `⚙️  Concurrency limit: ${CONFIG.concurrency === 'unbounded' ? 'unbounded (DB pool limited)' : `${CONFIG.concurrency} operations`}`,
  );
  console.log(`🗄️  Cycle Database: POSTGRES`);
  console.log(`ℹ️  User Database: POSTGRES\n`);
  console.log('Test Structure:');
  console.log('  Phase 1: Create all users (Sign Up)');
  console.log('  Phase 2: Execute cycle operations for all users');
  console.log('           - Create cycle');
  console.log('           - Update cycle');
  console.log('           - Complete cycle\n');

  // Phase 1: Sign Up
  const phase1Result = yield* signUpPhase(CONFIG.numUsers);

  // Phase 2: Cycle Operations
  const phase2Result = yield* cycleOperationsPhase(phase1Result.users);

  // Print final summary
  printFinalSummary(
    phase1Result.duration,
    phase2Result.duration,
    phase1Result.users.length, // Number of users created
    phase2Result.totalOperations, // Number of cycle operations
  );

  // Cleanup database
  console.log('\n🧹 Cleaning up test data...');
  yield* cleanupTestData();

  return { phase1: phase1Result, phase2: phase2Result };
}).pipe(Effect.provide(DatabaseLive));

// Run the program
const main = Effect.catchAll(program, (error) =>
  Effect.gen(function* () {
    console.error('\n❌ Stress test failed:', error);
    // Still try to cleanup
    yield* cleanupTestData().pipe(Effect.catchAll(() => Effect.void));
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
// This stress test runs in TWO PHASES:
//   Phase 1: Creates all test users concurrently (Sign Up)
//   Phase 2: Executes cycle operations for all users concurrently
//
// Configuration:
//   - CONFIG.numUsers: Number of concurrent users to simulate
//   - CONFIG.concurrency: Controls parallelism level
//     * 'unbounded': No artificial limit
//                    - Causes "batching" behavior (100 ops, pause, 100 ops...)
//                    - Bottleneck: HTTP server capacity + OS limits, NOT the database
//                    - With Neon's 10k connection support, DB is never the bottleneck
//     * number (e.g., 100, 200): Max concurrent operations at any time
//                    - Prevents overwhelming the HTTP server
//                    - Provides smoother, continuous execution
//                    - Recommended: 100-200 based on your server's capacity
//
// Output:
//   - Phase 1 timing (user creation) with RPS
//   - Phase 2 timing (cycle operations) with RPS
//   - Final summary with percentage breakdown and overall RPS
//   - Automatic database cleanup
//
// Requirements:
// - Server must be running on http://localhost:3000
// - Database must be accessible
// - JWT_SECRET environment variable must be set
