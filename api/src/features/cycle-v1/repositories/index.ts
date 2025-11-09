import { Layer } from 'effect';
import { CycleRepositoryPostgres } from './cycle.repository.postgres';
import { DatabaseLive } from '../../../db';

// Export types and interfaces
export * from './cycle.repository.interface';
export * from './errors';
export * from './schemas';

export { CycleRepositoryPostgres } from './cycle.repository.postgres';
export { CycleRepositoryRedis } from './cycle.repository.redis';
export { CycleRepositoryPostgres as CycleRepository } from './cycle.repository.postgres';
export const CycleRepositoryLive = CycleRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
