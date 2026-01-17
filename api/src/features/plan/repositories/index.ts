import { Layer } from 'effect';
import { PlanRepositoryPostgres } from './plan.repository.postgres';
import { DatabaseLive } from '../../../db';

// Export types and interfaces
export * from './plan.repository.interface';
export * from './errors';
export * from './schemas';

export { PlanRepositoryPostgres } from './plan.repository.postgres';
export { PlanRepositoryPostgres as PlanRepository } from './plan.repository.postgres';
export const PlanRepositoryLive = PlanRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
