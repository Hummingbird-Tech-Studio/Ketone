import { FetchHttpClient, HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Layer } from 'effect';
import { Api } from './api';
import { DatabaseLive } from './db';
import { LmdbLive } from './db/providers/lmdb/connection';
import { AuthServiceLive } from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { UserAuthCacheLive } from './features/auth/services';
import { CycleApiLive as CycleV2ApiLive } from './features/cycle-v1/api/cycle-api-handler';
import { CycleServiceLive } from './features/cycle-v1';
import { getCycleRepositoryLayer } from './features/cycle-v1/repositories';
import { AuthApiLive } from './features/auth/api/auth-api-handler';
import { getDatabaseConfigSync, CycleDatabaseProviders } from './config/database-config';

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

// Get the configured cycle repository layer (without dependencies)
// Type assertion needed because dynamic repository selection makes type inference difficult
const CycleRepositoryLayer = getCycleRepositoryLayer() as any;

// Determine which database layers to provide based on configuration
const config = getDatabaseConfigSync();
const DatabaseLayersLive =
  config.cycleDatabaseProvider === CycleDatabaseProviders.LMDB
    ? Layer.mergeAll(DatabaseLive, LmdbLive) // Postgres for users + LMDB for cycles
    : DatabaseLive; // Postgres for both users and cycles

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
  Layer.provide(CycleRepositoryLayer),
  Layer.provide(DatabaseLayersLive),
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
// Type assertion needed because dynamic repository layer selection makes type inference difficult
// All layers are properly provided based on configuration
(Layer.launch(HttpLive) as any).pipe(BunRuntime.runMain);
