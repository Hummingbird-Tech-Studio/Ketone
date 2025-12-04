import { Effect } from 'effect';
import { PasswordResetTokenError } from '../domain';

/**
 * Token Service
 * Handles cryptographically secure token generation and hashing
 */

const TOKEN_LENGTH_BYTES = 32; // 256 bits of randomness

export class TokenService extends Effect.Service<TokenService>()('TokenService', {
  effect: Effect.gen(function* () {
    return {
      /**
       * Generate a cryptographically secure random token
       * Returns the raw token (to send to user) and the hash (to store in DB)
       */
      generateSecureToken: () =>
        Effect.gen(function* () {
          const randomBytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH_BYTES));
          const rawToken = Buffer.from(randomBytes).toString('base64url');

          const tokenHash = yield* hashToken(rawToken);

          return { rawToken, tokenHash };
        }),

      /**
       * Hash a token using SHA-256
       */
      hashToken: (token: string) => hashToken(token),
    };
  }),
  accessors: true,
}) {}

/**
 * Hash a token using SHA-256
 */
const hashToken = (token: string) =>
  Effect.try({
    try: () => {
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(token);
      return hasher.digest('hex');
    },
    catch: (error) =>
      new PasswordResetTokenError({
        message: 'Failed to hash token',
        cause: error,
      }),
  });
