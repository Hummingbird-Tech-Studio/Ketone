import { Effect, Layer, Context } from 'effect';

/**
 * Cleanup Utilities for Integration Tests
 * Generic patterns for test data cleanup using Effect-TS
 */

/**
 * Generic cleanup configuration
 *
 * @template TRepo - Repository service type
 * @template TData - Test data tracker type
 */
export interface CleanupConfig<TRepo, TData> {
  /** Repository service Effect tag */
  repository: Context.Tag<unknown, TRepo>;

  /** Test data tracker object */
  testData: TData;

  /** Layer providing the repository service */
  repositoryLayer: Layer.Layer<TRepo, never, never>;

  /** Cleanup function that deletes test data */
  cleanupFn: (repository: TRepo, data: TData) => Effect.Effect<void, never, never>;

  /** Label for console output (e.g., "test users", "test cycles") */
  dataLabel: string;
}

/**
 * Create a generic cleanup function for afterAll hooks
 * Uses Effect-TS patterns with parallel deletion and error handling
 *
 * @param config - Cleanup configuration
 * @returns Function suitable for use in afterAll() hook
 *
 * @example
 * afterAll(createCleanup({
 *   repository: UserRepository,
 *   testData: testData,
 *   repositoryLayer: UserRepository.Default.pipe(Layer.provide(DatabaseLive)),
 *   cleanupFn: (repo, data) => Effect.all(
 *     Array.from(data.userEmails).map(email =>
 *       repo.deleteUserByEmail(email)
 *     ),
 *     { concurrency: 'unbounded' }
 *   ),
 *   dataLabel: 'test users'
 * }));
 */
export function createCleanup<TRepo, TData>(
  config: CleanupConfig<TRepo, TData>,
): () => Promise<void> {
  return async () => {
    const cleanupProgram = Effect.gen(function* () {
      const repository = yield* config.repository;

      console.log(`\n🧹 Starting ${config.dataLabel} cleanup...`);

      yield* config.cleanupFn(repository, config.testData);

      console.log(`✅ ${config.dataLabel} cleanup completed successfully\n`);
    });

    // Type assertion needed: TypeScript can't verify that repositoryLayer provides exactly TRepo
    // The CleanupConfig interface guarantees this contract at runtime
    const providedProgram = Effect.provide(cleanupProgram, config.repositoryLayer) as Effect.Effect<
      void,
      never,
      never
    >;

    const catchAllProgram = Effect.catchAll(providedProgram, (error) =>
      Effect.sync(() => {
        console.error(`⚠️  ${config.dataLabel} cleanup failed:`, error);
        // Don't fail the test suite if cleanup fails
      }),
    );

    await Effect.runPromise(catchAllProgram);
  };
}
