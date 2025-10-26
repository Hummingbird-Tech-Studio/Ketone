import { Effect } from 'effect';
import { JwtConfigError, JwtGenerationError } from '../domain';
import { JwtPayload } from '../domain';

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

    yield* Effect.logInfo(
      `[JwtService] JWT_SECRET validated successfully, expiration: ${TOKEN_EXPIRATION_SECONDS}s`,
    );

    return {
      /**
       * Generate a JWT token for a user
       */
      generateToken: (userId: string, email: string) =>
        Effect.tryPromise({
          try: async () => {
            return await new Promise<string>((resolve, reject) => {
              try {
                const header = {
                  alg: 'HS256',
                  typ: 'JWT',
                };

                const now = Math.floor(Date.now() / 1000);
                const exp = now + TOKEN_EXPIRATION_SECONDS;

                // Create and validate payload using schema
                const payload = new JwtPayload({
                  userId,
                  email,
                  iat: now,
                  exp,
                });

                const claims = {
                  userId: payload.userId,
                  email: payload.email,
                  iat: payload.iat,
                  exp: payload.exp,
                };

                // Encode header and payload
                const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
                const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
                const data = `${encodedHeader}.${encodedPayload}`;

                // Sign with HMAC SHA-256
                const encoder = new TextEncoder();
                const keyData = encoder.encode(JWT_SECRET);

                crypto.subtle
                  .importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
                  .then((key) => {
                    return crypto.subtle.sign('HMAC', key, encoder.encode(data));
                  })
                  .then((signature) => {
                    const encodedSignature = Buffer.from(signature).toString('base64url');
                    const jwt = `${data}.${encodedSignature}`;
                    resolve(jwt);
                  })
                  .catch(reject);
              } catch (error) {
                reject(error);
              }
            });
          },
          catch: (error) =>
            new JwtGenerationError({
              message: 'Failed to generate JWT token',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}
