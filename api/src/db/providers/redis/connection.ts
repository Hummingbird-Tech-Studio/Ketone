import { Effect, Layer, Context } from 'effect';
import Redis, { type Redis as RedisClient } from 'ioredis';

/**
 * Redis Connection Configuration
 */
export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
  readonly maxRetriesPerRequest?: number;
  readonly enableReadyCheck?: boolean;
  readonly lazyConnect?: boolean;
}

/**
 * Redis Database Tag for Effect Context
 */
export class RedisDatabase extends Context.Tag('RedisDatabase')<
  RedisDatabase,
  RedisClient
>() {}

/**
 * Default Redis configuration
 *
 * - host: Redis server hostname (default: localhost)
 * - port: Redis server port (default: 6379)
 * - password: Optional authentication password
 * - db: Database index (default: 0)
 * - maxRetriesPerRequest: Maximum retry attempts (default: 3)
 * - enableReadyCheck: Check connection before accepting commands (default: true)
 * - lazyConnect: Delay connection until first command (default: false)
 */
const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
};

/**
 * Create Redis connection Effect
 *
 * Opens a Redis connection with the specified configuration.
 * The connection is established with proper error handling and cleanup.
 */
const makeRedisConnection = (config: RedisConfig) =>
  Effect.gen(function* () {
    yield* Effect.logInfo(
      `🗄️  Connecting to Redis at: ${config.host}:${config.port}`,
    );

    const redis = yield* Effect.try({
      try: () => {
        const client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          maxRetriesPerRequest: config.maxRetriesPerRequest,
          enableReadyCheck: config.enableReadyCheck,
          lazyConnect: config.lazyConnect,
          retryStrategy: (times: number) => {
            // Exponential backoff: 50ms, 100ms, 200ms, etc., up to 2 seconds
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
        });

        // Wait for connection to be ready
        if (!config.lazyConnect) {
          return client;
        }

        return client;
      },
      catch: (error) => {
        console.error('❌ Failed to connect to Redis:', error);
        return new Error(`Failed to connect to Redis: ${error}`);
      },
    });

    // Wait for ready event
    yield* Effect.async<void, Error>((resume) => {
      const handleReady = () => {
        resume(Effect.void);
      };

      const handleError = (error: Error) => {
        resume(Effect.fail(new Error(`Redis connection error: ${error.message}`)));
      };

      redis.once('ready', handleReady);
      redis.once('error', handleError);

      // If already connected, resolve immediately
      if (redis.status === 'ready') {
        resume(Effect.void);
      }
    });

    yield* Effect.logInfo('✅ Redis connected successfully');

    // Add finalizer to close connection on cleanup
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logInfo('🔒 Closing Redis connection');
        yield* Effect.promise(() => redis.quit());
        yield* Effect.logInfo('✅ Redis connection closed');
      }),
    );

    return redis;
  });

/**
 * Redis Live Layer
 *
 * Provides a Redis connection as an Effect Layer.
 * This layer can be composed with other layers in the Effect ecosystem.
 *
 * Usage:
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const redis = yield* RedisDatabase;
 *   // Use redis...
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(RedisLive)));
 * ```
 */
export const RedisLive = Layer.effect(
  RedisDatabase,
  makeRedisConnection(defaultConfig),
);

/**
 * Create Redis Layer with custom configuration
 */
export const makeRedisLayer = (config: Partial<RedisConfig>) =>
  Layer.effect(RedisDatabase, makeRedisConnection({ ...defaultConfig, ...config }));
