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
  deleteTestUser,
} from './auth';

// ============================================================================
// Shared Types
// ============================================================================
export type { ErrorResponse, TestConfig } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * API server base URL for tests
 * Can be overridden via API_BASE_URL environment variable
 */
export const API_BASE_URL = Bun.env.API_BASE_URL || 'http://localhost:3000';
