import { Effect } from 'effect';

/**
 * Response Types
 */
export type VersionSuccess = { version: string };
export type VersionError = Error;

/**
 * Program to get version from static version.json file
 * This file is served from Cloudflare and only changes when web is deployed
 */
export const programGetVersion: Effect.Effect<VersionSuccess, VersionError> = Effect.tryPromise({
  try: async () => {
    const response = await fetch('/version.json', {
      cache: 'no-store', // Always fetch fresh version
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch version: ${response.status}`);
    }

    const data = await response.json();

    return { version: data.version };
  },
  catch: (error) => new Error(String(error)),
});
