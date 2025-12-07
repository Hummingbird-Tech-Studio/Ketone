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
      if (IS_PRODUCTION) {
        yield* Effect.logError('[EmailService] RESEND_API_KEY not set in production - emails will fail');
      } else {
        yield* Effect.logWarning('[EmailService] RESEND_API_KEY not set - emails will be logged only (dev mode)');
      }
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
            // In production, fail with error to prevent silent failures
            // Never log the token in production to prevent leakage
            if (IS_PRODUCTION) {
              return yield* Effect.fail(
                new EmailSendError({
                  message: 'Email service not configured (RESEND_API_KEY missing)',
                }),
              );
            }
            // In development, log the URL for testing purposes
            yield* Effect.logInfo(`[DEV MODE] Password reset URL: ${resetUrl}`);
            return;
          }

          yield* Effect.logInfo(`Sending password reset email`);

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
                  subject: 'Reset your Ketone password',
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
  const currentYear = new Date().getFullYear();
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);">
                <tr>
                  <td style="padding: 0 40px;">
                    <h1 style="margin: 25px 0 24px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Reset your Password</h1>
                    <p style="margin: 0 0 8px 0; font-size: 15px; color: #4a4a4a; line-height: 1.5;">Hi there,</p>
                    <p style="margin: 0 0 28px 0; font-size: 15px; color: #4a4a4a; line-height: 1.5;">You requested to reset your password. Click the button below to continue:</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 0 40px 24px 40px;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 32px; font-size: 15px; font-weight: 500; color: #22c55e; text-decoration: none; border: 2px solid #22c55e; border-radius: 8px;">Reset Password</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 28px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background-color: #f8edff; border: 1px solid #ab43ea; border-radius: 8px; padding: 12px 16px; text-align: center;">
                          <span style="font-size: 14px; color: #ab43ea;">&#128339; This link will expire in 15 minutes</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 8px 40px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.5;">If the button doesn't work, you can copy and paste this link into your browser:</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 24px 40px;">
                    <a href="${resetUrl}" style="font-size: 14px; color: #8b5cf6; word-break: break-all;">${resetUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 40px 32px 40px;">
                    <p style="margin: 0 0 20px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">If you didn't request this, you can safely ignore this email.</p>
                    <p style="margin: 0; font-size: 14px; color: #4a4a4a; line-height: 1.5;">Take care,<br><strong>The Ketone Team</strong></p>
                  </td>
                </tr>
              </table>
              <!-- Footer -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px;">
                <tr>
                  <td align="center" style="padding: 24px 40px;">
                    <p style="margin: 0; font-size: 13px; color: #9ca3af;">&copy; ${currentYear} Ketone. All rights reserved</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function generatePasswordResetEmailText(resetUrl: string): string {
  const currentYear = new Date().getFullYear();
  return `
Ketone

Reset your Password

Hi there,

You requested to reset your password. Click the link below to continue:

${resetUrl}

This link will expire in 15 minutes.

If you didn't request this, you can safely ignore this email.

Take care,
The Ketone Team

© ${currentYear} Ketone. All rights reserved
  `.trim();
}
