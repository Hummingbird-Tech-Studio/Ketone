import { Layer } from 'effect';
import { CycleRepositoryRedis } from './cycle.repository.redis';
import { RedisLive } from '../../../db/providers/redis/connection';

// Export types and interfaces
export * from './cycle.repository.interface';
export * from './errors';
export * from './schemas';

export { CycleRepositoryPostgres } from './cycle.repository.postgres';
export { CycleRepositoryRedis } from './cycle.repository.redis';
export { CycleRepositoryRedis as CycleRepository } from './cycle.repository.redis';
export const CycleRepositoryLive = CycleRepositoryRedis.Default.pipe(Layer.provide(RedisLive));
