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
// Orleans Cleanup Utilities
// ============================================================================
export { deleteOrleansStorageByGrainId } from './orleans-cleanup';

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
// Shared Types
// ============================================================================
export type { ErrorResponse, TestConfig } from './types';

// ============================================================================
// Constants
// ============================================================================
export { API_BASE_URL, ORLEANS_BASE_URL } from '../config/environment';
