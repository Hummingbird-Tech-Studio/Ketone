import { Layer } from 'effect';
import { getDatabaseConfigSync, CycleDatabaseProviders } from '../../../config/database-config';
import { CycleRepositoryPostgres } from './cycle.repository.postgres';
import { CycleRepositoryLmdb } from './cycle.repository.lmdb';
import { DatabaseLive } from '../../../db';
import { LmdbLive } from '../../../db/providers/lmdb/connection';

// Export types and interfaces
export * from './cycle.repository.interface';
export * from './errors';
export * from './schemas';

// Export concrete implementations
export { CycleRepositoryPostgres } from './cycle.repository.postgres';
export { CycleRepositoryLmdb } from './cycle.repository.lmdb';

/**
 * CycleRepository - Dynamic repository that uses the configured database provider
 *
 * This is a re-export that maintains backward compatibility while allowing
 * dynamic selection of the database implementation based on configuration.
 *
 * All implementations share the same service tag 'CycleRepository' and
 * implement the ICycleRepository interface, ensuring type compatibility.
 */

/**
 * Get the appropriate CycleRepository Layer with all dependencies resolved
 *
 * Returns a Layer that includes:
 * - The configured CycleRepository implementation (Postgres or LMDB)
 * - All required database connections
 *
 * For Postgres: Includes DatabaseLive (PgClient + PgDrizzle)
 * For LMDB: Includes DatabaseLive (for users) + LmdbLive (for cycles)
 */
export function getCycleRepositoryLayerWithDependencies() {
  const config = getDatabaseConfigSync();

  switch (config.cycleDatabaseProvider) {
    case CycleDatabaseProviders.LMDB:
      // LMDB repository needs both Postgres (for users) and LMDB (for cycles)
      return CycleRepositoryLmdb.Default.pipe(
        Layer.provide(LmdbLive),
        Layer.provideMerge(DatabaseLive),
      );
    case CycleDatabaseProviders.REDIS:
      console.warn('⚠️  Redis provider not yet implemented, falling back to Postgres');
      return CycleRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
    case CycleDatabaseProviders.POSTGRES:
    default:
      // Postgres repository only needs DatabaseLive
      return CycleRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
  }
}

/**
 * Get the bare CycleRepository Layer (without dependencies)
 *
 * Use this only if you're manually managing layer dependencies.
 * For most cases, use getCycleRepositoryLayerWithDependencies() instead.
 */
export function getCycleRepositoryLayer() {
  const config = getDatabaseConfigSync();

  switch (config.cycleDatabaseProvider) {
    case CycleDatabaseProviders.LMDB:
      return CycleRepositoryLmdb.Default;
    case CycleDatabaseProviders.REDIS:
      console.warn('⚠️  Redis provider not yet implemented, falling back to Postgres');
      return CycleRepositoryPostgres.Default;
    case CycleDatabaseProviders.POSTGRES:
    default:
      return CycleRepositoryPostgres.Default;
  }
}

/**
 * CycleRepository - Backward-compatible export
 *
 * For backward compatibility, we export CycleRepositoryPostgres as CycleRepository.
 * To use dynamic selection, import and use getCycleRepositoryLayer() instead.
 */
export { CycleRepositoryPostgres as CycleRepository } from './cycle.repository.postgres';
