import { FetchHttpClient, HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Layer } from 'effect';
import { Api } from './api';
import { DatabaseLive } from './db';
import { AuthServiceLive } from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { UserAuthCacheLive } from './features/auth/services';
import { CycleApiLive as CycleV2ApiLive } from './features/cycle-v1/api/cycle-api-handler';
import { CycleServiceLive } from './features/cycle-v1';
import { AuthApiLive } from './features/auth/api/auth-api-handler';

// ============================================================================
// Effect HTTP Server (Public API)
// ============================================================================

/**
 * HTTP Server Layer Configuration
 *
 * Combine all API groups into a single unified API, then provide handlers.
 * This ensures proper error metadata preservation for all endpoints.
 */

// Combine handlers
const HandlersLive = Layer.mergeAll(CycleV2ApiLive, AuthApiLive);

// Combine API with handlers
const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(HandlersLive));

const HttpLive = HttpApiBuilder.serve().pipe(
  // Add CORS middleware
  Layer.provide(HttpApiBuilder.middlewareCors()),
  // Provide unified API
  Layer.provide(ApiLive),
  // Provide middleware and services
  Layer.provide(AuthenticationLive),
  Layer.provide(CycleServiceLive),
  Layer.provide(AuthServiceLive),
  Layer.provide(UserAuthCacheLive),
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
