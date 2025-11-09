import { HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime, BunKeyValueStore } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { Api } from './api';
import { DatabaseLive } from './db';
import { AuthServiceLive, JwtService } from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { UserAuthCacheLive } from './features/auth/services';
import { CycleApiLive, CycleService, CycleRepositoryPostgres, CycleKVStore } from './features/cycle-v1';
import { CycleCompletionCache } from './features/cycle-v1';
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
const HandlersLive = Layer.mergeAll(CycleApiLive, AuthApiLive);

// Infrastructure layers
const KeyValueStoreLive = BunKeyValueStore.layerFileSystem('.data/cycles');

// Service layers that depend on infrastructure
const ServiceLayers = Layer.mergeAll(
  JwtService.Default,
  AuthServiceLive,
  CycleRepositoryPostgres.Default,
  CycleCompletionCache.Default,
  CycleKVStore.Default,
  CycleService.Default,
);

// Combine API with handlers and provide service layers
const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(HandlersLive), Layer.provide(ServiceLayers));

const HttpLive = HttpApiBuilder.serve().pipe(
  // Add CORS middleware
  Layer.provide(HttpApiBuilder.middlewareCors()),
  // Provide unified API
  Layer.provide(ApiLive),
  // Provide middleware
  Layer.provide(AuthenticationLive),
  Layer.provide(UserAuthCacheLive),
  // Provide infrastructure layers at top level (shared by all services and middleware)
  Layer.provide(DatabaseLive),
  Layer.provide(KeyValueStoreLive),
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
BunRuntime.runMain(Effect.scoped(Layer.launch(HttpLive)));