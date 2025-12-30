import { Config } from 'effect';

export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfigShape {
  readonly port: number;
  readonly nodeEnv: NodeEnv;
  readonly apiBaseUrl: string;
}

const NodeEnvConfig = Config.literal(
  'development',
  'production',
  'test',
)('NODE_ENV').pipe(Config.withDefault('development'));

const PortConfig = Config.integer('PORT').pipe(
  Config.orElse(() => Config.integer('API_PORT')),
  Config.withDefault(3000),
);

export const AppConfigLive: Config.Config<AppConfigShape> = Config.all({
  port: PortConfig,
  nodeEnv: NodeEnvConfig,
  apiBaseUrl: Config.string('API_BASE_URL').pipe(Config.withDefault('http://localhost:3000')),
});
