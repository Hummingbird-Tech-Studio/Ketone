import { Config, ConfigError, Either, Redacted } from 'effect';

export interface DatabaseConfigShape {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: Redacted.Redacted<string>;
  readonly database: string;
  readonly ssl: boolean;
}

const parseConnectionUrl = (url: string) => {
  const urlObj = new URL(url);
  return {
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 5432,
    username: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
  };
};

const SslConfig = Config.boolean('DATABASE_SSL').pipe(Config.withDefault(true));

export const DatabaseConfigLive: Config.Config<DatabaseConfigShape> = Config.all({
  url: Config.string('DATABASE_URL'),
  ssl: SslConfig,
}).pipe(
  Config.mapOrFail(({ url, ssl }) => {
    try {
      const parsed = parseConnectionUrl(url);
      return Either.right({
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: Redacted.make(parsed.password),
        database: parsed.database,
        ssl,
      });
    } catch {
      return Either.left(ConfigError.InvalidData(['DATABASE_URL'], 'Invalid database URL format'));
    }
  }),
);
