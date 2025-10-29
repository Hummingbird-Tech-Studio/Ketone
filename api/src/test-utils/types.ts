/**
 * Shared Types for Integration Tests
 * Common interfaces and types used across test suites
 */

/**
 * Generic error response matching domain error schemas
 * All domain errors have _tag and message, plus optional fields
 */
export interface ErrorResponse {
  _tag: string;
  message: string;
  [key: string]: unknown; // Allow additional fields like email, userId, etc.
}

/**
 * Configuration for test environments
 */
export interface TestConfig {
  apiBaseUrl: string;
  jwtSecret: string;
  orleansBaseUrl?: string;
}

/**
 * Generic test data tracker
 * Used to track test data for cleanup
 */
export interface TestDataTracker<T extends string = string> {
  [key: string]: Set<T>;
}
