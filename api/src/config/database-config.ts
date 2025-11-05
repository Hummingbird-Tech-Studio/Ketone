import { Effect } from 'effect';

/**
 * Supported database providers for Cycle storage
 */
export const CycleDatabaseProviders = {
  POSTGRES: 'postgres',
  LMDB: 'lmdb',
  REDIS: 'redis',
} as const;

export type CycleDatabaseProvider =
  (typeof CycleDatabaseProviders)[keyof typeof CycleDatabaseProviders];

/**
 * Database Configuration
 *
 * This configuration determines which database implementation is used for
 * storing cycle data. Users are always stored in Postgres regardless of
 * this setting (hybrid architecture).
 */
export interface DatabaseConfig {
  /**
   * The database provider to use for cycle storage
   */
  cycleDatabaseProvider: CycleDatabaseProvider;
}

/**
 * Validate that a string is a valid cycle database provider
 */
function isValidProvider(value: string): value is CycleDatabaseProvider {
  return Object.values(CycleDatabaseProviders).includes(value as CycleDatabaseProvider);
}

/**
 * Get the cycle database provider from environment variables
 *
 * Environment variable: CYCLE_DATABASE_PROVIDER
 * Valid values: 'postgres', 'lmdb', 'redis'
 * Default: 'postgres'
 */
export function getCycleDatabaseProvider(): CycleDatabaseProvider {
  const envValue = Bun.env.CYCLE_DATABASE_PROVIDER;
  console.log('CYCLE_DATABASE_PROVIDER', envValue);

  if (!envValue) {
    return CycleDatabaseProviders.POSTGRES;
  }

  const normalized = envValue.toLowerCase().trim();

  if (!isValidProvider(normalized)) {
    console.warn(
      `⚠️  Invalid CYCLE_DATABASE_PROVIDER: "${envValue}". ` +
        `Valid values are: ${Object.values(CycleDatabaseProviders).join(', ')}. ` +
        `Falling back to default: postgres`,
    );
    return CycleDatabaseProviders.POSTGRES;
  }

  return normalized;
}

/**
 * Load database configuration from environment
 *
 * Returns an Effect that:
 * - Reads environment variables
 * - Validates the configuration
 * - Logs the selected database provider
 * - Returns the configuration
 */
export const loadDatabaseConfig = Effect.gen(function* () {
  const cycleDatabaseProvider = getCycleDatabaseProvider();

  yield* Effect.logInfo(
    `🗄️  Cycle Database Provider: ${cycleDatabaseProvider.toUpperCase()}`,
  );

  if (cycleDatabaseProvider !== CycleDatabaseProviders.POSTGRES) {
    yield* Effect.logInfo(
      `ℹ️  Note: Users are always stored in Postgres (hybrid architecture)`,
    );
  }

  const config: DatabaseConfig = {
    cycleDatabaseProvider,
  };

  return config;
});

/**
 * Get current database configuration synchronously
 *
 * Use this when you need the configuration outside of an Effect context.
 * For Effect contexts, prefer loadDatabaseConfig.
 */
export function getDatabaseConfigSync(): DatabaseConfig {
  return {
    cycleDatabaseProvider: getCycleDatabaseProvider(),
  };
}
