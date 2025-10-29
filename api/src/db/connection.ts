import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { PgClient } from '@effect/sql-pg';
import { Config, Layer, Redacted } from 'effect';

const connectionUrl = Bun.env.DATABASE_URL;

if (!connectionUrl) {
  throw new Error(
    'DATABASE_URL environment variable is required. ' +
      'Please configure your NEON Postgres connection string in .env file. ' +
      'See NEON_SETUP.md for instructions.',
  );
}

/**
 * Parse DATABASE_URL and extract connection parameters
 */
function parseConnectionUrl(url: string) {
  const urlObj = new URL(url);
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 5432,
    username: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
  };
}

const dbParams = parseConnectionUrl(connectionUrl);

console.log('🔌 Connecting to Neon PostgreSQL with @effect/sql-pg...');
console.log('   Host:', dbParams.host);
console.log('   Port:', dbParams.port);
console.log('   Database:', dbParams.database);

/**
 * PgClient Layer with explicit configuration
 * SSL is enabled by default for Neon
 */
export const PgLive = PgClient.layerConfig({
  host: Config.succeed(dbParams.host),
  port: Config.succeed(dbParams.port),
  database: Config.succeed(dbParams.database),
  username: Config.succeed(dbParams.username),
  password: Config.succeed(Redacted.make(dbParams.password)),
  ssl: Config.succeed(true),
});

/**
 * Drizzle Layer composed with PgClient
 */
const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive));

/**
 * Combined Database Layer providing both PgClient and PgDrizzle
 */
export const DatabaseLive = Layer.mergeAll(PgLive, DrizzleLive);
