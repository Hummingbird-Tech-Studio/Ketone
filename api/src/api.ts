import { HttpApi } from '@effect/platform';
import { CycleApiGroup } from './features/cycle/api/cycle-api';
import { AuthApiGroup } from './features/auth/api/auth-api';
import { ProfileApiGroup } from './features/profile/api/profile-api';
import { UserAccountApiGroup } from './features/user-account/api/user-account-api';
import { VersionApiGroup } from './features/version/api/version-api';
import { PlanApiGroup } from './features/plan/api/plan-api';

/**
 * Unified API
 * Combines all API groups into a single unified API.
 * This ensures proper error metadata preservation for all endpoints.
 */
export const Api = HttpApi.make('api')
  .add(CycleApiGroup)
  .add(AuthApiGroup)
  .add(ProfileApiGroup)
  .add(UserAccountApiGroup)
  .add(VersionApiGroup)
  .add(PlanApiGroup);
