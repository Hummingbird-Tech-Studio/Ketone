import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { BuildConfigLive } from '../../../config';
import packageJson from '../../../../package.json';

const APP_VERSION = packageJson.version;

/**
 * Version API Handler
 * Implementation of the Version API contract
 */

export const VersionApiLive = HttpApiBuilder.group(Api, 'version', (handlers) =>
  Effect.gen(function* () {
    const buildConfig = yield* BuildConfigLive;

    return handlers.handle('getVersion', () =>
      Effect.gen(function* () {
        yield* Effect.logDebug(`GET /v1/version - Returning version: ${APP_VERSION}`);

        return {
          version: APP_VERSION,
          buildTime: buildConfig.buildTime,
        };
      }).pipe(Effect.annotateLogs({ handler: 'version.getVersion' })),
    );
  }),
);
