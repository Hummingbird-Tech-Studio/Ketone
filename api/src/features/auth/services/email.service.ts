import { Effect } from 'effect';
import { EmailSendError } from '../domain';

const FRONTEND_URL = Bun.env.FRONTEND_URL || 'http://localhost:5173';
const RESEND_API_KEY = Bun.env.RESEND_API_KEY;
const FROM_EMAIL = Bun.env.FROM_EMAIL || 'onboarding@resend.dev';
const IS_PRODUCTION = Bun.env.NODE_ENV === 'production';

/**
 * TLS verification is enabled by default (secure).
 * In development, Bun may have issues with local CA certificates when using corporate VPN.
 * Set SKIP_TLS_VERIFY=true in .env to disable verification in development only.
 * This setting is ignored in production for security.
 */
const SKIP_TLS_VERIFY = !IS_PRODUCTION && Bun.env.SKIP_TLS_VERIFY === 'true';

interface ResendEmailResponse {
  id?: string;
  statusCode?: number;
  name?: string;
  message?: string;
}

export class EmailService extends Effect.Service<EmailService>()('EmailService', {
  effect: Effect.gen(function* () {
    if (!RESEND_API_KEY) {
      yield* Effect.logWarning('[EmailService] RESEND_API_KEY not set - emails will be logged only');
    } else {
      yield* Effect.logInfo(`[EmailService] FROM_EMAIL: ${FROM_EMAIL}`);
      if (SKIP_TLS_VERIFY) {
        yield* Effect.logWarning('[EmailService] TLS verification disabled (development only)');
      }
    }

    return {
      sendPasswordResetEmail: (to: string, token: string) =>
        Effect.gen(function* () {
          const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

          if (!RESEND_API_KEY) {
            yield* Effect.logInfo(`DEV MODE - Password reset URL: ${resetUrl}`);
            return;
          }

          yield* Effect.logInfo(`Sending password reset email to ${to}`);

          yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${RESEND_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: FROM_EMAIL,
                  to,
                  subject: 'Reset your password',
                  html: generatePasswordResetEmailHtml(resetUrl),
                  text: generatePasswordResetEmailText(resetUrl),
                }),
                ...(SKIP_TLS_VERIFY && {
                  tls: { rejectUnauthorized: false },
                }),
              });

              const data = (await response.json()) as ResendEmailResponse;

              if (!response.ok) {
                throw new Error(data.message || response.statusText);
              }

              return data;
            },
            catch: (error) =>
              new EmailSendError({
                message: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
                cause: error,
              }),
          });

          yield* Effect.logInfo(`Password reset email sent to ${to}`);
        }).pipe(Effect.annotateLogs({ service: 'EmailService' })),
    };
  }),
  accessors: true,
}) {}

function generatePasswordResetEmailHtml(resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Reset Your Password</h1>
          <p style="color: #666; line-height: 1.6;">
            You requested to reset your password. Click the button below to create a new password.
            This link will expire in 15 minutes.
          </p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #999; font-size: 14px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <p style="color: #999; font-size: 12px;">
            Or copy and paste this URL into your browser:<br>
            <a href="${resetUrl}" style="color: #007bff;">${resetUrl}</a>
          </p>
        </div>
      </body>
    </html>
  `;
}

function generatePasswordResetEmailText(resetUrl: string): string {
  return `
Reset Your Password

You requested to reset your password. Click the link below to create a new password.
This link will expire in 15 minutes.

${resetUrl}

If you didn't request this, you can safely ignore this email.
  `.trim();
}
