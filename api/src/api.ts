import { HttpApi } from '@effect/platform';
import { CycleApiGroup as CycleV2ApiGroup } from './features/cycle-v1/api/cycle-api';
import { AuthApiGroup } from './features/auth/api/auth-api';

/**
 * Unified API
 * Combines all API groups into a single unified API.
 * This ensures proper error metadata preservation for all endpoints.
 */
export const Api = HttpApi.make('api').add(CycleV2ApiGroup).add(AuthApiGroup);
