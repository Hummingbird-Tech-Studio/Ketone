import { jwtVerify, SignJWT } from 'jose';
import { Effect, Option, Redacted } from 'effect';
import { getUnixTime } from 'date-fns';
import { JwtGenerationError, JwtPayload, JwtVerificationError } from '../domain';
import { JwtConfigLive } from '../../../config';

/**
 * JWT Service
 * Handles JWT token generation and validation
 */

export class JwtService extends Effect.Service<JwtService>()('JwtService', {
  effect: Effect.gen(function* () {
    const jwtConfig = yield* JwtConfigLive;
    const secretValue = Redacted.value(jwtConfig.secret);

    yield* Effect.logInfo(`JWT configured with ${jwtConfig.expirationSeconds}s expiration`);

    return {
      generateToken: (userId: string, email: string, passwordChangedAt?: Date) =>
        Effect.gen(function* () {
          const now = getUnixTime(new Date());
          const exp = now + jwtConfig.expirationSeconds;

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
                .sign(new TextEncoder().encode(secretValue)),
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
              const verified = await jwtVerify(token, new TextEncoder().encode(secretValue));
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
  }).pipe(Effect.annotateLogs({ service: 'JwtService' })),
  accessors: true,
}) {}
