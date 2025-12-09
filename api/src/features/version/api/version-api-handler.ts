import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import packageJson from '../../../../package.json';

const APP_VERSION = packageJson.version;
const BUILD_TIME = Bun.env.BUILD_TIME || new Date().toISOString();

/**
 * Version API Handler
 * Implementation of the Version API contract
 */

export const VersionApiLive = HttpApiBuilder.group(Api, 'version', (handlers) =>
  Effect.gen(function* () {
    return handlers.handle('getVersion', () =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`[Handler] GET /v1/version - Returning version: ${APP_VERSION}`);

        return {
          version: APP_VERSION,
          buildTime: BUILD_TIME,
        };
      }),
    );
  }),
);
