/**
 * Version checking configuration
 */

/** Polling interval in milliseconds (5 minutes) */
export const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Current app version (injected at build time) */
export const CURRENT_VERSION = __APP_VERSION__;

/** Build timestamp (injected at build time) */
export const BUILD_TIME = __BUILD_TIME__;
