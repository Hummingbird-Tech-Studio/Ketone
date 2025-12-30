import { Config, Option } from 'effect';

export interface EmailConfigShape {
  readonly resendApiKey: Option.Option<string>;
  readonly fromEmail: string;
  readonly frontendUrl: string;
  readonly skipTlsVerify: boolean;
}

export const EmailConfigLive: Config.Config<EmailConfigShape> = Config.all({
  resendApiKey: Config.string('RESEND_API_KEY').pipe(Config.option),
  fromEmail: Config.string('FROM_EMAIL').pipe(Config.withDefault('onboarding@resend.dev')),
  frontendUrl: Config.string('FRONTEND_URL').pipe(Config.withDefault('http://localhost:5173')),
  skipTlsVerify: Config.boolean('SKIP_TLS_VERIFY').pipe(Config.withDefault(false)),
});
