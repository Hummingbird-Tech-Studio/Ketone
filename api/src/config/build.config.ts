import { Config } from 'effect';

export interface BuildConfigShape {
  readonly buildTime: string;
}

export const BuildConfigLive: Config.Config<BuildConfigShape> = Config.all({
  buildTime: Config.string('BUILD_TIME').pipe(Config.withDefault(new Date().toISOString())),
});
