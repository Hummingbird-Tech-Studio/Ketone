/**
 * Main entry point for Effect HTTP Server with Orleans
 *
 */

import { FetchHttpClient, HttpApiBuilder, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Layer } from 'effect';
import { DatabaseLive } from './db';
import { CycleApi } from './features/cycle/api/cycle-api';
import { CycleApiLive } from './features/cycle/api/cycle-api-handler';
import { OrleansClient } from './features/cycle/infrastructure';
import { CycleOrleansService } from './features/cycle/services/cycle-orleans.service';

// ============================================================================
// Effect HTTP Server (Public API)
// ============================================================================

const MainApiLive = HttpApiBuilder.api(CycleApi).pipe(Layer.provide(CycleApiLive));

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(MainApiLive),
  Layer.provide(CycleOrleansService.Default), // Provide Orleans service
  Layer.provide(OrleansClient.Default), // Provide Orleans HTTP client
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
