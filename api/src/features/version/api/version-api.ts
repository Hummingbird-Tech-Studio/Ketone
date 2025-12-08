import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { VersionResponseSchema } from '@ketone/shared';

/**
 * Version API Contract definition
 * Public endpoint for SPA version checking (no authentication required)
 */

export class VersionApiGroup extends HttpApiGroup.make('version').add(
  // GET /v1/version - Get current app version
  HttpApiEndpoint.get('getVersion', '/v1/version').addSuccess(VersionResponseSchema),
) {}
