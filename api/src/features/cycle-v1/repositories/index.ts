import { CycleRepositoryRedis } from './cycle.repository.redis';

// Export types and interfaces
export * from './cycle.repository.interface';
export * from './errors';
export * from './schemas';

// Export concrete implementations
export { CycleRepositoryPostgres } from './cycle.repository.postgres';
export { CycleRepositoryRedis } from './cycle.repository.redis';

/**
 * CycleRepository - Fixed Redis implementation
 *
 * The application uses Redis for all cycle business logic.
 * Redis implementation uses Lua scripts for atomic operations to prevent race conditions.
 *
 * All implementations share the same service tag 'CycleRepository' to allow
 * interchangeable use in tests.
 */
export { CycleRepositoryRedis as CycleRepository } from './cycle.repository.redis';

/**
 * Get the CycleRepository Layer
 *
 * Returns the Redis repository layer (bare, without dependencies).
 * Dependencies (DatabaseLive and RedisLive) are provided at the application level.
 */
export function getCycleRepositoryLayer() {
  return CycleRepositoryRedis.Default;
}
