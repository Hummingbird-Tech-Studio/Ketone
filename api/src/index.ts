import { HttpApiBuilder, HttpMiddleware, HttpServer } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { Api } from './api';
import { DatabaseLive } from './db';
import {
  AuthService,
  JwtService,
  UserAuthCache,
  PasswordRecoveryService,
  LoginAttemptCache,
  SignupIpRateLimitService,
  PasswordResetIpRateLimitService,
} from './features/auth/services';
import { AuthenticationLive } from './features/auth/api/middleware';
import { CycleApiLive, CycleService } from './features/cycle';
import { AuthApiLive } from './features/auth/api/auth-api-handler';
import { ProfileApiLive, ProfileService } from './features/profile';
import { UserAccountApiLive, UserAccountService } from './features/user-account';
import { VersionApiLive } from './features/version';

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
const HandlersLive = Layer.mergeAll(CycleApiLive, AuthApiLive, ProfileApiLive, UserAccountApiLive, VersionApiLive);

// Service layers - use .Default which automatically includes all dependencies
const ServiceLayers = Layer.mergeAll(
  JwtService.Default, // No dependencies - standalone service
  UserAuthCache.Default, // Needed by AuthenticationLive middleware - includes UserRepository
  AuthService.Default, // Includes UserRepository, PasswordService, JwtService, UserAuthCache
  CycleService.Default, // Includes CycleRepository, CycleCompletionCache, CycleRefCache
  ProfileService.Default, // Includes ProfileRepository
  UserAccountService.Default, // Includes UserRepository, PasswordService
  PasswordRecoveryService.Default, // Includes UserRepository, TokenService, EmailService, etc.
  LoginAttemptCache.Default, // Rate limiting for login attempts by email/IP
  SignupIpRateLimitService.Default, // Rate limiting for signup by IP
  PasswordResetIpRateLimitService.Default, // Rate limiting for password reset by IP
);

// Combine API with handlers and provide service layers
const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(HandlersLive), Layer.provide(ServiceLayers));

// xForwardedHeaders middleware populates remoteAddress from X-Forwarded-* headers
// when behind a reverse proxy/load balancer
const HttpLive = HttpApiBuilder.serve(HttpMiddleware.xForwardedHeaders).pipe(
  // Add CORS middleware
  Layer.provide(HttpApiBuilder.middlewareCors()),
  // Provide unified API
  Layer.provide(ApiLive),
  // Provide middleware (AuthenticationLive needs JwtService and UserAuthCache)
  Layer.provide(AuthenticationLive),
  // Provide service layers (must come after middleware that depends on services)
  Layer.provide(ServiceLayers),
  // Provide infrastructure layers at top level (shared by all services and middleware)
  Layer.provide(DatabaseLive),
  HttpServer.withLogAddress,
  Layer.provide(
    BunHttpServer.layer({
      port: Number(Bun.env.PORT || Bun.env.API_PORT || 3000),
    }),
  ),
);

// ============================================================================
// Application Startup
// ============================================================================

// Start Effect HTTP Server (port 3000)
console.log('🚀 Starting Effect HTTP Server...');
BunRuntime.runMain(Effect.scoped(Layer.launch(HttpLive)));
