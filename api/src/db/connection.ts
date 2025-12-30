import * as PgDrizzle from '@effect/sql-drizzle/Pg';
import { PgClient } from '@effect/sql-pg';
import { Config, Effect, Layer } from 'effect';
import { DatabaseConfigLive } from '../config';

/**
 * PgClient Layer with configuration from environment
 * SSL is enabled by default for Neon
 */
export const PgLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const dbConfig = yield* DatabaseConfigLive;

    yield* Effect.logInfo('Connecting to PostgreSQL...');
    yield* Effect.logDebug(`Host: ${dbConfig.host}, Port: ${dbConfig.port}, Database: ${dbConfig.database}`);

    return PgClient.layerConfig({
      host: Config.succeed(dbConfig.host),
      port: Config.succeed(dbConfig.port),
      database: Config.succeed(dbConfig.database),
      username: Config.succeed(dbConfig.username),
      password: Config.succeed(dbConfig.password),
      ssl: Config.succeed(dbConfig.ssl),
    });
  }).pipe(Effect.annotateLogs({ module: 'DatabaseConnection' })),
);

/**
 * Drizzle Layer composed with PgClient
 */
const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive));

/**
 * Combined Database Layer providing both PgClient and PgDrizzle
 */
export const DatabaseLive = Layer.mergeAll(PgLive, DrizzleLive);
