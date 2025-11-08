import { HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { Api } from './api';
import { DatabaseLive } from './db';
import { AuthServiceLive, JwtService } from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { UserAuthCacheLive } from './features/auth/services';
import { CycleApiLive, CycleService } from './features/cycle-v1';
import { CycleCompletionCache } from './features/cycle-v1';
import { RedisLive } from './db/providers/redis/connection';
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

// Combine API with handlers and provide auth services needed by handlers
const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(HandlersLive),
  Layer.provide(JwtService.Default),
  Layer.provide(AuthServiceLive),
  Layer.provide(UserAuthCacheLive),
  Layer.provide(CycleService.Default),
  Layer.provide(CycleCompletionCache.Default),
  Layer.provide(RedisLive),
  Layer.provide(DatabaseLive),
);

const HttpLive = HttpApiBuilder.serve().pipe(
  // Add CORS middleware
  Layer.provide(HttpApiBuilder.middlewareCors()),
  // Provide unified API
  Layer.provide(ApiLive),
  // Provide middleware
  Layer.provide(AuthenticationLive),
  // Auth services - shared by middleware and handlers (including WebSocket)
  Layer.provide(JwtService.Default),
  Layer.provide(AuthServiceLive),
  Layer.provide(UserAuthCacheLive),
  // Cycle services
  Layer.provide(CycleService.Default),
  Layer.provide(CycleCompletionCache.Default),
  Layer.provide(RedisLive),
  // Database - provided once for all services
  Layer.provide(DatabaseLive),
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