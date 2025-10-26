import { SignJWT } from 'jose';
import { Effect } from 'effect';
import { JwtConfigError, JwtGenerationError, JwtPayload } from '../domain';

/**
 * JWT Service
 * Handles JWT token generation and validation
 */

export class JwtService extends Effect.Service<JwtService>()('JwtService', {
  effect: Effect.gen(function* () {
    const JWT_SECRET = Bun.env.JWT_SECRET;

    if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < 32) {
      yield* Effect.logError('[JwtService] JWT_SECRET validation failed');
      return yield* Effect.fail(
        new JwtConfigError({
          message: 'JWT_SECRET must be set and at least 32 characters long',
        }),
      );
    }

    // Token expiration in seconds (configurable via env, default: 7 days)
    const TOKEN_EXPIRATION_SECONDS = Bun.env.JWT_EXPIRATION_SECONDS
      ? parseInt(Bun.env.JWT_EXPIRATION_SECONDS, 10)
      : 7 * 24 * 60 * 60; // 7 days

    if (isNaN(TOKEN_EXPIRATION_SECONDS) || TOKEN_EXPIRATION_SECONDS <= 0) {
      yield* Effect.logError('[JwtService] Invalid JWT_EXPIRATION_SECONDS');
      return yield* Effect.fail(
        new JwtConfigError({
          message: 'JWT_EXPIRATION_SECONDS must be a positive number',
        }),
      );
    }

    return {
      /**
       * Generate a JWT token for a user
       */
      generateToken: (userId: string, email: string) =>
        Effect.gen(function* () {
          const now = Math.floor(Date.now() / 1000);
          const exp = now + TOKEN_EXPIRATION_SECONDS;

          // Validate payload using schema
          const payload = new JwtPayload({
            userId,
            email,
            iat: now,
            exp,
          });

          return yield* Effect.tryPromise({
            try: () =>
              new SignJWT({
                userId: payload.userId,
                email: payload.email,
              })
                .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
                .setIssuedAt(payload.iat)
                .setExpirationTime(payload.exp)
                .sign(new TextEncoder().encode(JWT_SECRET)),
            catch: (error) =>
              new JwtGenerationError({
                message: 'Failed to generate JWT token',
                cause: error,
              }),
          });
        }),
    };
  }),
  accessors: true,
}) {}
