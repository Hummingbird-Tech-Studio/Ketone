import { Effect } from 'effect';
import { PasswordHashError } from '../domain';

/**
 * Password Service
 * Handles password hashing and verification using Bun's built-in crypto
 */

const SALT_ROUNDS = 12;

export class PasswordService extends Effect.Service<PasswordService>()('PasswordService', {
  effect: Effect.gen(function* () {
    return {
      /**
       * Hash a password using bcrypt
       */
      hashPassword: (password: string) =>
        Effect.tryPromise({
          try: async () => {
            return await Bun.password.hash(password, {
              algorithm: 'bcrypt',
              cost: SALT_ROUNDS,
            });
          },
          catch: (error) =>
            new PasswordHashError({
              message: 'Failed to hash password',
              cause: error,
            }),
        }),

      /**
       * Verify a password against a hash
       */
      verifyPassword: (password: string, hash: string) =>
        Effect.tryPromise({
          try: async () => {
            const isValid = await Bun.password.verify(password, hash);
            return isValid;
          },
          catch: (error) =>
            new PasswordHashError({
              message: 'Failed to verify password',
              cause: error,
            }),
        }),
    };
  }),
  accessors: true,
}) {}
