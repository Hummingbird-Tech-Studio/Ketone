import { Layer } from 'effect';
import { ProfileRepositoryPostgres } from './profile.repository.postgres';
import { DatabaseLive } from '../../../db';

// Export types and interfaces
export * from './profile.repository.interface';
export * from './errors';
export * from './schemas';

export { ProfileRepositoryPostgres } from './profile.repository.postgres';
export { ProfileRepositoryPostgres as ProfileRepository } from './profile.repository.postgres';
export const ProfileRepositoryLive = ProfileRepositoryPostgres.Default.pipe(Layer.provide(DatabaseLive));
