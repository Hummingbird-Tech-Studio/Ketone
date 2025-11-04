import { jwtVerify, SignJWT } from 'jose';
import { Effect, Option } from 'effect';
import { getUnixTime } from 'date-fns';
import { JwtConfigError, JwtGenerationError, JwtPayload, JwtVerificationError } from '../domain';

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
      generateToken: (userId: string, email: string, passwordChangedAt?: Date) =>
        Effect.gen(function* () {
          const now = getUnixTime(new Date());
          const exp = now + TOKEN_EXPIRATION_SECONDS;

          const passwordChangedAtOption = Option.fromNullable(passwordChangedAt).pipe(
            Option.map((date) => getUnixTime(date)),
          );

          const payload = new JwtPayload({
            userId,
            email,
            iat: now,
            exp,
            passwordChangedAt: passwordChangedAtOption,
          });

          const jwtPayload: Record<string, unknown> = {
            userId: payload.userId,
            email: payload.email,
          };

          if (Option.isSome(payload.passwordChangedAt)) {
            jwtPayload.passwordChangedAt = payload.passwordChangedAt.value;
          }

          return yield* Effect.tryPromise({
            try: () =>
              new SignJWT(jwtPayload)
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

      verifyToken: (token: string) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            try: async () => {
              const verified = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
              return verified.payload;
            },
            catch: (error) =>
              new JwtVerificationError({
                message: 'Failed to verify JWT token',
                cause: error,
              }),
          });

          return yield* Effect.try({
            try: () =>
              new JwtPayload({
                userId: result.userId as string,
                email: result.email as string,
                iat: result.iat as number,
                exp: result.exp as number,
                passwordChangedAt: Option.fromNullable(result.passwordChangedAt as number | undefined),
              }),
            catch: (error) =>
              new JwtVerificationError({
                message: 'Invalid JWT payload structure',
                cause: error,
              }),
          });
        }),
    };
  }),
  accessors: true,
}) {}
