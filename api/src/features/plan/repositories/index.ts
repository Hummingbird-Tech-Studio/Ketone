import { Layer } from 'effect';
import { PlanRepositoryPostgres } from './plan.repository.postgres';
import { PlanTemplateRepositoryPostgres } from './plan-template.repository';
import { DatabaseLive } from '../../../db';

// Export types and interfaces
export * from './plan.repository.interface';
export * from './plan-template.repository.interface';
export * from './errors';
export * from './schemas';
export * from './mappers';

export { PlanRepositoryPostgres } from './plan.repository.postgres';
export { PlanRepositoryPostgres as PlanRepository } from './plan.repository.postgres';
export const PlanRepositoryLive = PlanRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));

export { PlanTemplateRepositoryPostgres } from './plan-template.repository';
export { PlanTemplateRepositoryPostgres as PlanTemplateRepository } from './plan-template.repository';
export const PlanTemplateRepositoryLive = PlanTemplateRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
