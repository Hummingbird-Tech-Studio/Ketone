import { FetchHttpClient, HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Layer } from 'effect';
import { DatabaseLive } from './db';
import { AuthServiceLive } from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { OrleansClient } from './features/cycle/infrastructure';
import { CycleOrleansService } from './features/cycle/services/cycle-orleans.service';
import { CycleApiLive } from './features/cycle/api/cycle-api-handler';
import { AuthApiLive } from './features/auth/api/auth-api-handler';
import { CycleApi } from './features/cycle/api/cycle-api';
import { AuthApi } from './features/auth/api/auth-api';

// ============================================================================
// Effect HTTP Server (Public API)
// ============================================================================

/**
 * HTTP Server Layer Configuration
 * 
 * IMPORTANT: Layer Composition and Error Handling
 * ------------------------------------------------
 * This layer configuration provides each API separately to HttpApiBuilder.serve()
 * instead of pre-combining them with Layer.mergeAll().
 * 
 * WHY THIS MATTERS:
 * When using Layer.mergeAll() to combine multiple HttpApiBuilder.api() results
 * before providing them to serve(), the error schema metadata (including status codes)
 * gets lost during the merge operation. This causes API errors to return as generic
 * 500 errors with empty bodies, even though they're properly caught and transformed
 * in the handlers.
 * 
 * CORRECT PATTERN (Current):
 * ```typescript
 * HttpApiBuilder.serve().pipe(
 *   Layer.provide(HttpApiBuilder.api(CycleApi)),  // Each API provided separately
 *   Layer.provide(HttpApiBuilder.api(AuthApi)),
 *   Layer.provide(CycleApiLive),                  // Handlers provided separately
 *   Layer.provide(AuthApiLive),
 * )
 * ```
 * 
 * INCORRECT PATTERN (Causes 500 errors):
 * ```typescript
 * const ApiLive = Layer.mergeAll(
 *   HttpApiBuilder.api(CycleApi).pipe(Layer.provide(CycleApiLive)),
 *   HttpApiBuilder.api(AuthApi).pipe(Layer.provide(AuthApiLive))
 * );
 * HttpApiBuilder.serve().pipe(Layer.provide(ApiLive))
 * ```
 * 
 * TECHNICAL EXPLANATION:
 * HttpApiBuilder.serve() needs direct access to each API's error schemas to properly
 * register them with the HTTP framework. When APIs are merged into a single layer,
 * the serve() function can't traverse the merged structure to extract the error
 * metadata, resulting in unhandled errors being converted to generic 500 responses.
 * 
 * By providing each API directly, serve() can properly register all error schemas
 * with their corresponding status codes (409, 401, etc.) and ensure correct
 * serialization of error responses.
 */
const HttpLive = HttpApiBuilder.serve().pipe(
  // Middleware
  Layer.provide(HttpApiBuilder.middlewareCors()),
  // API implementations
  Layer.provide(HttpApiBuilder.api(CycleApi)),
  Layer.provide(HttpApiBuilder.api(AuthApi)),
  // Handler implementations
  Layer.provide(CycleApiLive),
  Layer.provide(AuthApiLive),
  // Middleware and services
  Layer.provide(AuthenticationLive),
  Layer.provide(CycleOrleansService.Default),
  Layer.provide(OrleansClient.Default),
  Layer.provide(AuthServiceLive),
  Layer.provide(DatabaseLive),
  Layer.provide(FetchHttpClient.layer),
  HttpServer.withLogAddress,
  Layer.provide(
    BunHttpServer.layer({
      port: 3000,
    }),
  ),
);

// ============================================================================
// Application Startup
// ============================================================================

// Start Effect HTTP Server (port 3000)
console.log('🚀 Starting Effect HTTP Server...');
Layer.launch(HttpLive).pipe(BunRuntime.runMain);
