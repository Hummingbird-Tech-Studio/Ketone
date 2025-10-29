/**
 * Test Data Tracking Utilities
 * Helpers for tracking test data that needs cleanup
 */

/**
 * Create a test data tracker for cleanup
 * This is a typed identity function that provides better type inference
 * Supports both Set and Map for tracking different types of test data
 *
 * @param initial - Initial tracker object with Sets or Maps for each data type
 * @returns The same object with proper typing
 *
 * @example
 * const testData = createTestDataTracker({
 *   userEmails: new Set<string>(),
 *   cycleIds: new Set<string>(),
 * });
 *
 * // With Map for tracking related data
 * const testData = createTestDataTracker({
 *   users: new Map<string, string>(), // Map<email, userId>
 * });
 *
 * // Later in tests
 * testData.userEmails.add('test@example.com');
 * testData.users.set('test@example.com', 'user-123');
 */
export function createTestDataTracker<T extends Record<string, Set<any> | Map<any, any>>>(
  initial: T,
): T {
  return initial;
}
