/**
 * Version checking configuration
 */

/** Initial delay before first version check */
export const VERSION_CHECK_INITIAL_DELAY_MS = 1000;

/** Polling interval in milliseconds (1 minute) */
export const VERSION_CHECK_INTERVAL_MS = 60 * 1000;

/** Current web app version (injected at build time from web/package.json) */
export const CURRENT_VERSION = __APP_VERSION__;

/** Build timestamp (injected at build time) */
export const BUILD_TIME = __BUILD_TIME__;
