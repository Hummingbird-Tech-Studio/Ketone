import { Console, Duration, Effect } from 'effect';

// Function to make a single request
const makeRequest = (index: number) =>
  Effect.gen(function* () {
    const cycleId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    console.log('userId', userId);
    //const url = `http://localhost:3000/cycle/${cycleId}`;
    //const url = `http://localhost:3000/cycle/memory/${cycleId}`;
    //const url = `http://localhost:5174/cycle/${cycleId}`;
    const url = `http://localhost:3000/cycle/orleans/${cycleId}`;
    const body = {
      startDate: '2025-10-13T08:00:00Z',
      endDate: '2025-10-14T08:00:00Z',
      userId: userId,
      state: 'InProgress',
    };

    yield* Console.log(`[Request ${index}] 🚀 Starting with cycleId: ${cycleId}`);

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          //verbose: true,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      catch: (error) => new Error(`Request ${index} failed: ${error}`),
    });

    const data = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () => new Error(`Failed to parse JSON for request ${index}`),
    });

    yield* Console.log(`[Request ${index}] ✅ Completed - Status: ${response.status}`);

    return {
      index,
      cycleId,
      userId,
      status: response.status,
      data,
    };
  });

// Create 500 requests and run them in parallel with timing
const program = Effect.gen(function* () {
  yield* Console.log('🚀 Starting 500 requests simultaneously...\n');

  // Create array of 500 effects
  const requests = Array.from({ length: 1000 }, (_, i) => makeRequest(i + 1));

  // Execute all in parallel with unlimited concurrency and measure time
  const results = yield* Effect.all(requests, {
    concurrency: 'unbounded',
    //concurrency: 10000,
    //mode: 'default',
  }).pipe(Effect.timed);

  const [duration, data] = results;

  yield* Console.log('\n✅ All requests completed!');
  yield* Console.log(`\n⏱️  Total execution time: ${Duration.toMillis(duration)}ms`);
  yield* Console.log(`⏱️  Total execution time: ${Duration.toSeconds(duration)}s`);

  // Calculate statistics
  const successCount = data.filter((r) => r.status >= 200 && r.status < 300).length;
  const errorCount = data.length - successCount;

  yield* Console.log('\n📊 Summary:');
  yield* Console.log(`   Total requests: ${data.length}`);
  yield* Console.log(`   Successful: ${successCount}`);
  yield* Console.log(`   Failed: ${errorCount}`);
  yield* Console.log(`   Average time per request: ${(Duration.toMillis(duration) / data.length).toFixed(2)}ms`);

  return data;
});

// Run the program with timing
const timedProgram = program.pipe(Effect.timed);

Effect.runPromise(timedProgram)
  .then(([duration, results]) => {
    console.log('\n✨ Program completed');
    console.log(`📈 Final execution time: ${Duration.toMillis(duration)}ms (${Duration.toSeconds(duration)}s)`);
  })
  .catch(console.error);

// bun run api/src/tests/requests.ts

// ✅ All requests completed!
// ⏱️  Total execution time: 5359.208083ms
// ⏱️  Total execution time: 5.359208083s
// 📊 Summary:
//    Total requests: 1000
//    Successful: 1000
//    Failed: 0
//    Average time per request: 5.36ms
// ✨ Program completed
// 📈 Final execution time: 5360.251875ms (5.360251875s)