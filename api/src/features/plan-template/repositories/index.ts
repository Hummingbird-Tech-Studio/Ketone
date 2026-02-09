import { Layer } from 'effect';
import { PlanTemplateRepositoryPostgres } from './plan-template.repository';
import { DatabaseLive } from '../../../db';

// Export types and interfaces
export * from './plan-template.repository.interface';
export * from './errors';
export * from './schemas';
export * from './mappers';

export { PlanTemplateRepositoryPostgres } from './plan-template.repository';
export { PlanTemplateRepositoryPostgres as PlanTemplateRepository } from './plan-template.repository';
export const PlanTemplateRepositoryLive = PlanTemplateRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
