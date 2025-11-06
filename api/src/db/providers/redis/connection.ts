import { Context, Effect, Layer, Schedule } from 'effect';
import { RedisClient } from 'bun';

export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
}

/**
 * Extended Redis client with additional methods not directly supported by Bun's RedisClient.
 * Uses the generic send() method to implement eval, multi, and other advanced features.
 */
export class ExtendedRedisClient extends RedisClient {
  /**
   * Execute a Lua script using EVAL command
   */
  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any> {
    return this.send('eval', [script, numKeys.toString(), ...args.map(String)]);
  }

  /**
   * Start a Redis transaction (MULTI)
   * Returns a pipeline object for chaining commands
   */
  multi(): RedisPipeline {
    return new RedisPipeline(this);
  }
}

/**
 * Pipeline for Redis transactions (MULTI/EXEC)
 */
class RedisPipeline {
  private commands: Array<{ cmd: string; args: any[] }> = [];

  constructor(private client: RedisClient) {}

  hset(key: string, ...args: any[]): this {
    this.commands.push({ cmd: 'hset', args: [key, ...args] });
    return this;
  }

  zadd(key: string, score: number | string, member: string): this {
    this.commands.push({ cmd: 'zadd', args: [key, score, member] });
    return this;
  }

  async exec(): Promise<any[]> {
    // Start transaction
    await this.client.send('multi', []);

    // Queue all commands
    for (const { cmd, args } of this.commands) {
      await this.client.send(cmd, args.map(String));
    }

    // Execute transaction
    return await this.client.send('exec', []);
  }
}

export class RedisDatabase extends Context.Tag('RedisDatabase')<RedisDatabase, ExtendedRedisClient>() {}

const defaultConfig: RedisConfig = {
  host: Bun.env.REDIS_HOST || 'localhost',
  port: Number(Bun.env.REDIS_PORT) || 6379,
  password: Bun.env.REDIS_PASSWORD,
  db: Number(Bun.env.REDIS_DB) || 0,
};

/**
 * Exponential backoff schedule for Redis connection retries
 *
 * - Base delay: 50ms
 * - Exponential factor: 2 (50ms -> 100ms -> 200ms -> 400ms -> 800ms -> 1600ms)
 * - Max delay: 2000ms (2 seconds)
 * - Max attempts: 10
 */
const retrySchedule = Schedule.exponential('50 millis').pipe(
  Schedule.union(Schedule.spaced('2 seconds')), // Cap maximum delay at 2 seconds
  Schedule.compose(Schedule.recurs(10)), // Maximum 10 retry attempts
);

const buildRedisUrl = (config: RedisConfig): string => {
  const auth = config.password ? `:${config.password}@` : '';
  const db = config.db ? `/${config.db}` : '';
  return `redis://${auth}${config.host}:${config.port}${db}`;
};

const makeRedisConnection = (config: RedisConfig) =>
  Effect.gen(function* () {
    const url = buildRedisUrl(config);
    yield* Effect.logInfo(`🗄️  Connecting to Redis at: ${config.host}:${config.port}`);

    const client = new ExtendedRedisClient(url);

    yield* Effect.tryPromise({
      try: () => client.connect(),
      catch: (error) => new Error(`Failed to connect to Redis: ${error}`),
    }).pipe(Effect.retry(retrySchedule));

    yield* Effect.logInfo('✅ Redis connected successfully');

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.logInfo('🔒 Closing Redis connection');
        yield* Effect.sync(() => client.close());
        yield* Effect.logInfo('✅ Redis connection closed');
      }),
    );

    return client;
  });

export const RedisLive = Layer.scoped(RedisDatabase, makeRedisConnection(defaultConfig));
