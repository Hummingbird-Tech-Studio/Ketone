import { Effect, Layer } from 'effect';
import { getDatabaseConfigSync, CycleDatabaseProviders } from '../../../config/database-config';
import { CycleRepositoryPostgres } from './cycle.repository.postgres';
import { CycleRepositoryLmdb } from './cycle.repository.lmdb';
import { CycleRepositoryRedis } from './cycle.repository.redis';
import { DatabaseLive } from '../../../db';
import { LmdbLive } from '../../../db/providers/lmdb/connection';
import { RedisLive } from '../../../db/providers/redis/connection';

// Export types and interfaces
export * from './cycle.repository.interface';
export * from './errors';
export * from './schemas';

// Export concrete implementations
export { CycleRepositoryPostgres } from './cycle.repository.postgres';
export { CycleRepositoryLmdb } from './cycle.repository.lmdb';
export { CycleRepositoryRedis } from './cycle.repository.redis';

/**
 * CycleRepository - Backward-compatible export
 *
 * For backward compatibility, we export CycleRepositoryPostgres as CycleRepository.
 * Tests and code that import CycleRepository will use Postgres implementation.
 * The server uses getCycleRepositoryLayer() for dynamic selection based on env vars.
 *
 * All implementations share the same service tag 'CycleRepository' to allow
 * interchangeable use. The Redis implementation now uses Lua scripts for atomic
 * operations to prevent race conditions.
 */
export { CycleRepositoryPostgres as CycleRepository } from './cycle.repository.postgres';

/**
 * Get the appropriate CycleRepository Layer with all dependencies resolved
 *
 * Returns a Layer that includes:
 * - The configured CycleRepository implementation (Postgres, LMDB, or Redis)
 * - All required database connections
 *
 * For Postgres: Includes DatabaseLive (PgClient + PgDrizzle)
 * For LMDB: Includes DatabaseLive (for users) + LmdbLive (for cycles)
 * For Redis: Includes DatabaseLive (for users) + RedisLive (for cycles)
 */
export function getCycleRepositoryLayerWithDependencies() {
  const config = getDatabaseConfigSync();

  switch (config.cycleDatabaseProvider) {
    case CycleDatabaseProviders.LMDB:
      // LMDB repository needs both Postgres (for users) and LMDB (for cycles)
      return CycleRepositoryLmdb.Default.pipe(Layer.provide(LmdbLive), Layer.provideMerge(DatabaseLive));
    case CycleDatabaseProviders.REDIS:
      // Redis repository needs both Postgres (for users) and Redis (for cycles)
      return CycleRepositoryRedis.Default.pipe(Layer.provide(RedisLive), Layer.provideMerge(DatabaseLive));
    case CycleDatabaseProviders.POSTGRES:
    default:
      // Postgres repository only needs DatabaseLive
      return CycleRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
  }
}

/**
 * Get the bare CycleRepository Layer (without dependencies)
 *
 * Returns the configured implementation's Default layer.
 * Use this only if you're manually managing layer dependencies.
 * For most cases, use getCycleRepositoryLayerWithDependencies() instead.
 */
export function getCycleRepositoryLayer() {
  const config = getDatabaseConfigSync();

  switch (config.cycleDatabaseProvider) {
    case CycleDatabaseProviders.LMDB:
      return CycleRepositoryLmdb.Default;
    case CycleDatabaseProviders.REDIS:
      return CycleRepositoryRedis.Default;
    case CycleDatabaseProviders.POSTGRES:
    default:
      return CycleRepositoryPostgres.Default;
  }
}
