import { Effect } from 'effect';
import { getUnixTime } from 'date-fns';
import { PasswordResetTokenInvalidError } from '../domain';
import { UserRepository, PasswordResetTokenRepository } from '../repositories';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailService } from './email.service';
import { UserAuthCache } from './user-auth-cache.service';
import { PasswordResetIpRateLimitService } from './password-reset-ip-rate-limit.service';

export class PasswordRecoveryService extends Effect.Service<PasswordRecoveryService>()(
  'PasswordRecoveryService',
  {
    effect: Effect.gen(function* () {
      const userRepository = yield* UserRepository;
      const tokenRepository = yield* PasswordResetTokenRepository;
      const passwordService = yield* PasswordService;
      const tokenService = yield* TokenService;
      const emailService = yield* EmailService;
      const userAuthCache = yield* UserAuthCache;
      const ipRateLimitService = yield* PasswordResetIpRateLimitService;

      return {
        /**
         * Request password reset - sends email if user exists
         * Always returns success to prevent email enumeration
         *
         * Rate limiting is done by IP (not by account) to prevent DoS attacks
         * where an attacker could block a legitimate user from resetting their password.
         * See: OWASP Cheat Sheet - Forgot Password
         */
        requestPasswordReset: (email: string, ip: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordRecoveryService] Password reset requested`);

            // Check rate limit by IP first (before any other operation)
            const rateLimitStatus = yield* ipRateLimitService.checkAndIncrement(ip);

            if (!rateLimitStatus.allowed) {
              yield* Effect.logWarning(`[PasswordRecoveryService] Rate limit exceeded for IP`);
              // Return success to prevent information leaking
              return { message: 'If an account exists, a reset email has been sent' };
            }

            const canonicalEmail = email.trim().toLowerCase();

            // Find user by email
            const user = yield* userRepository.findUserByEmail(canonicalEmail);

            if (!user) {
              yield* Effect.logInfo(`[PasswordRecoveryService] User not found, returning success anyway`);
              // Return success to prevent email enumeration
              return { message: 'If an account exists, a reset email has been sent' };
            }

            // Generate secure token
            const { rawToken, tokenHash } = yield* tokenService.generateSecureToken();

            // Store hashed token
            yield* tokenRepository.createToken(user.id, tokenHash);

            // Send email (fire-and-forget with logging on failure)
            yield* emailService.sendPasswordResetEmail(canonicalEmail, rawToken).pipe(
              Effect.catchAll((error) =>
                Effect.logError(`[PasswordRecoveryService] Failed to send email: ${error}`),
              ),
            );

            yield* Effect.logInfo(`[PasswordRecoveryService] Password reset email sent`);

            return { message: 'If an account exists, a reset email has been sent' };
          }),

        /**
         * Reset password using token
         */
        resetPassword: (token: string, newPassword: string) =>
          Effect.gen(function* () {
            yield* Effect.logInfo(`[PasswordRecoveryService] Password reset attempt`);

            // Hash the provided token
            const tokenHash = yield* tokenService.hashToken(token);

            // Find valid token
            const tokenRecord = yield* tokenRepository.findValidTokenByHash(tokenHash);

            if (!tokenRecord) {
              yield* Effect.logWarning(`[PasswordRecoveryService] Invalid or expired token`);
              return yield* Effect.fail(
                new PasswordResetTokenInvalidError({
                  message: 'Invalid or expired reset token',
                }),
              );
            }

            // Double-check expiration (belt and suspenders)
            if (new Date() > tokenRecord.expiresAt) {
              yield* Effect.logWarning(`[PasswordRecoveryService] Token expired`);
              return yield* Effect.fail(
                new PasswordResetTokenInvalidError({
                  message: 'Reset token has expired',
                }),
              );
            }

            // Hash new password
            const passwordHash = yield* passwordService.hashPassword(newPassword);

            // Update user password (this also updates passwordChangedAt)
            const updatedUser = yield* userRepository.updateUserPassword(tokenRecord.userId, passwordHash);

            // Mark token as used (do this after password update succeeds)
            yield* tokenRepository.markTokenAsUsed(tokenRecord.id);

            // Update cache with new passwordChangedAt to invalidate existing sessions
            if (updatedUser.passwordChangedAt) {
              const timestamp = getUnixTime(updatedUser.passwordChangedAt);
              yield* userAuthCache.setPasswordChangedAt(updatedUser.id, timestamp).pipe(
                Effect.catchAll((error) =>
                  Effect.logWarning(`[PasswordRecoveryService] Failed to update cache: ${error}`),
                ),
              );
            }

            yield* Effect.logInfo(
              `[PasswordRecoveryService] Password reset successful for user ${tokenRecord.userId}`,
            );

            return { message: 'Password has been reset successfully' };
          }),
      };
    }),
    dependencies: [
      UserRepository.Default,
      PasswordResetTokenRepository.Default,
      PasswordService.Default,
      TokenService.Default,
      EmailService.Default,
      UserAuthCache.Default,
      PasswordResetIpRateLimitService.Default,
    ],
    accessors: true,
  },
) {}
