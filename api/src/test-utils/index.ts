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
export { API_BASE_URL } from '../config/environment';
