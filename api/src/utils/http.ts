import { HttpServerRequest } from '@effect/platform';
import { Effect } from 'effect';

/**
 * Get client IP from request.
 * Uses remoteAddress which is populated by HttpMiddleware.xForwardedHeaders
 * when behind a reverse proxy/load balancer.
 */
export const getClientIp = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<string> =>
  Effect.gen(function* () {
    const remoteAddress = request.remoteAddress;
    if (remoteAddress._tag === 'Some' && remoteAddress.value) {
      return remoteAddress.value;
    }

    yield* Effect.logWarning('[getClientIp] No client IP found. Rate limiting will use fallback identifier.');

    return 'unknown';
  });
