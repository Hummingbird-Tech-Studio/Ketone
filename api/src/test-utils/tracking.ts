/**
 * Test Data Tracking Utilities
 * Helpers for tracking test data that needs cleanup
 */

/**
 * Create a test data tracker for cleanup
 * This is a typed identity function that provides better type inference
 *
 * @param initial - Initial tracker object with Sets for each data type
 * @returns The same object with proper typing
 *
 * @example
 * const testData = createTestDataTracker({
 *   userEmails: new Set<string>(),
 *   cycleIds: new Set<string>(),
 * });
 *
 * // Later in tests
 * testData.userEmails.add('test@example.com');
 * testData.cycleIds.add('cycle-123');
 */
export function createTestDataTracker<T extends Record<string, Set<any>>>(initial: T): T {
  return initial;
}
