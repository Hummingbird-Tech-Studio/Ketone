import { HttpServerRequest } from '@effect/platform';
import { Data, Effect } from 'effect';

/**
 * Error thrown when client IP cannot be determined.
 * This typically indicates a proxy/load balancer misconfiguration.
 */
export class ClientIpNotFoundError extends Data.TaggedError('ClientIpNotFoundError')<{
  readonly message: string;
}> {}

/**
 * Get client IP from request.
 * Uses remoteAddress which is populated by HttpMiddleware.xForwardedHeaders
 * when behind a reverse proxy/load balancer.
 *
 * Fails with ClientIpNotFoundError when IP cannot be determined to prevent
 * security vulnerabilities from shared rate-limit buckets.
 */
export const getClientIp = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<string, ClientIpNotFoundError> =>
  Effect.gen(function* () {
    const remoteAddress = request.remoteAddress;
    if (remoteAddress._tag === 'Some' && remoteAddress.value) {
      return remoteAddress.value;
    }

    yield* Effect.logError(
      '[getClientIp] No client IP found. This likely indicates a proxy/load balancer misconfiguration.',
    );

    return yield* Effect.fail(
      new ClientIpNotFoundError({
        message: 'Unable to determine client IP address',
      }),
    );
  });
