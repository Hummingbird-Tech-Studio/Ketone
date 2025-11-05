import { Effect, Layer, Context } from 'effect';
import { open, type Database, type RootDatabase } from 'lmdb';
import { join } from 'node:path';

/**
 * LMDB Connection Configuration
 */
export interface LmdbConfig {
  readonly path: string;
  readonly mapSize?: number;
  readonly maxDbs?: number;
  readonly compression?: boolean;
}

/**
 * LMDB Database Tag for Effect Context
 */
export class LmdbDatabase extends Context.Tag('LmdbDatabase')<
  LmdbDatabase,
  RootDatabase
>() {}

/**
 * Default LMDB configuration
 *
 * - path: Stores database files in api/.lmdb directory
 * - mapSize: 10GB maximum database size
 * - maxDbs: Support for multiple named databases
 * - compression: Enabled for better storage efficiency
 */
const defaultConfig: LmdbConfig = {
  path: process.env.LMDB_PATH || join(process.cwd(), '.lmdb'),
  mapSize: 10 * 1024 * 1024 * 1024, // 10 GB
  maxDbs: 10,
  compression: true,
};

/**
 * Create LMDB connection Effect
 *
 * Opens an LMDB database with the specified configuration.
 * The database is opened in a safe way with proper error handling.
 */
const makeLmdbConnection = (config: LmdbConfig) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`🗄️  Opening LMDB database at: ${config.path}`);

    const db = yield* Effect.try({
      try: () =>
        open({
          path: config.path,
          mapSize: config.mapSize,
          maxDbs: config.maxDbs,
          compression: config.compression,
          // Enable write transactions for data consistency
          useVersions: false,
          // Set encoding to msgpack for better performance with structured data
          encoding: 'msgpack' as any,
        }),
      catch: (error) => {
        console.error('❌ Failed to open LMDB database:', error);
        return new Error(`Failed to open LMDB database: ${error}`);
      },
    });

    yield* Effect.logInfo('✅ LMDB database opened successfully');

    // Add finalizer to close database on cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logInfo('🔒 Closing LMDB database');
        yield* Effect.sync(() => db.close());
        yield* Effect.logInfo('✅ LMDB database closed');
      }),
    );

    return db;
  });

/**
 * LMDB Live Layer
 *
 * Provides an LMDB database connection as an Effect Layer.
 * This layer can be composed with other layers in the Effect ecosystem.
 *
 * Usage:
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const db = yield* LmdbDatabase;
 *   // Use db...
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(LmdbLive)));
 * ```
 */
export const LmdbLive = Layer.effect(LmdbDatabase, makeLmdbConnection(defaultConfig));

/**
 * Create LMDB Layer with custom configuration
 */
export const makeLmdbLayer = (config: Partial<LmdbConfig>) =>
  Layer.effect(LmdbDatabase, makeLmdbConnection({ ...defaultConfig, ...config }));
