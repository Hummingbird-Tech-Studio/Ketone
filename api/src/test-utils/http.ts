import { Effect } from 'effect';

/**
 * HTTP Utilities for Integration Tests
 * Common HTTP request patterns using Effect-TS
 */

/**
 * Make HTTP request with Effect-TS pattern
 * Returns status, parsed JSON, and response object
 *
 * @example
 * const { status, json } = yield* makeRequest('http://localhost:3000/api/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ email: 'test@example.com' })
 * });
 */
export const makeRequest = (url: string, options: RequestInit) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, options),
      catch: (error) => new Error(`HTTP request failed: ${error}`),
    });

    const status = response.status;
    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => {
        console.warn(`Failed to parse JSON response from ${url}:`, error);
        return {};
      },
    });

    return { status, json, response };
  });
