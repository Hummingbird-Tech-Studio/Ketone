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

// Build complete API implementations for each module
const CycleApiImplementation = HttpApiBuilder.api(CycleApi).pipe(Layer.provide(CycleApiLive));
const AuthApiImplementation = HttpApiBuilder.api(AuthApi).pipe(Layer.provide(AuthApiLive));

// Combine all API implementations
const ApiLive = Layer.mergeAll(CycleApiImplementation, AuthApiImplementation);

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(ApiLive),
  Layer.provide(AuthenticationLive), // Provide Authentication middleware for protected endpoints
  Layer.provide(CycleOrleansService.Default), // Provide Orleans service
  Layer.provide(OrleansClient.Default), // Provide Orleans HTTP client
  Layer.provide(AuthServiceLive), // Provide Auth service with dependencies
  Layer.provide(DatabaseLive), // Provide shared database connection pool
  Layer.provide(FetchHttpClient.layer), // Provide HttpClient for Orleans calls
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
