import { Config, Redacted } from 'effect';

export interface JwtConfigShape {
  readonly secret: Redacted.Redacted<string>;
  readonly expirationSeconds: number;
}

const DEFAULT_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const JwtConfigLive: Config.Config<JwtConfigShape> = Config.all({
  secret: Config.redacted('JWT_SECRET').pipe(
    Config.validate({
      message: 'JWT_SECRET must be at least 32 characters',
      validation: (r) => Redacted.value(r).length >= 32,
    }),
  ),
  expirationSeconds: Config.integer('JWT_EXPIRATION_SECONDS').pipe(
    Config.validate({
      message: 'JWT_EXPIRATION_SECONDS must be positive',
      validation: (n) => n > 0,
    }),
    Config.withDefault(DEFAULT_EXPIRATION_SECONDS),
  ),
});
