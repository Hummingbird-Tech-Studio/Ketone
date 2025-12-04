import { Effect } from 'effect';
import { Resend } from 'resend';
import { EmailSendError } from '../domain';

const FRONTEND_URL = Bun.env.FRONTEND_URL || 'http://localhost:5173';
const RESEND_API_KEY = Bun.env.RESEND_API_KEY;
const FROM_EMAIL = Bun.env.FROM_EMAIL || 'onboarding@resend.dev';

export class EmailService extends Effect.Service<EmailService>()('EmailService', {
  effect: Effect.gen(function* () {
    if (!RESEND_API_KEY) {
      yield* Effect.logWarning('[EmailService] RESEND_API_KEY not set - emails will be logged only');
    }

    const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

    return {
      /**
       * Send password reset email
       */
      sendPasswordResetEmail: (to: string, token: string) =>
        Effect.gen(function* () {
          const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

          yield* Effect.logInfo(`[EmailService] Sending password reset email to ${to}`);

          // In development without API key, just log the URL
          if (!resend) {
            yield* Effect.logInfo(`[EmailService] DEV MODE - Password reset URL: ${resetUrl}`);
            return;
          }

          yield* Effect.tryPromise({
            try: async () => {
              const { error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: Bun.env.NODE_ENV === 'production' ? to : 'delivered@resend.dev',
                subject: 'Reset your password',
                html: generatePasswordResetEmailHtml(resetUrl),
                text: generatePasswordResetEmailText(resetUrl),
              });

              if (error) {
                throw error;
              }
            },
            catch: (error) =>
              new EmailSendError({
                message: 'Failed to send password reset email',
                cause: error,
              }),
          });

          yield* Effect.logInfo(`[EmailService] Password reset email sent to ${to}`);
        }),
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
