/**
 * Test Utilities
 * Shared utilities for integration tests across all features
 *
 * @module test-utils
 */

// ============================================================================
// HTTP Utilities
// ============================================================================
export { makeRequest } from './http';

// ============================================================================
// Cleanup Utilities
// ============================================================================
export { createCleanup } from './cleanup';
export type { CleanupConfig } from './cleanup';

// ============================================================================
// Auth Utilities
// ============================================================================
export {
  validateJwtSecret,
  generateTestToken,
  generateExpiredToken,
  generateTestEmail,
  createTestUser,
} from './auth';

// ============================================================================
// Tracking Utilities
// ============================================================================
export { createTestDataTracker } from './tracking';

// ============================================================================
// Shared Types
// ============================================================================
export type { ErrorResponse, TestConfig, TestDataTracker } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * API server base URL for integration tests
 * Default: http://localhost:3000
 */
export const API_BASE_URL = 'http://localhost:3000';

/**
 * Orleans sidecar base URL for integration tests
 * Default: http://localhost:5174 (can be overridden via ORLEANS_BASE_URL env var)
 */
export const ORLEANS_BASE_URL = Bun.env.ORLEANS_BASE_URL || 'http://localhost:5174';
