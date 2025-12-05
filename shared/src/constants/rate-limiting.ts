/**
 * Rate Limiting Constants for Password Verification
 *
 * Used by both API (backend) and Web (frontend) to ensure consistent
 * rate limiting behavior across the application.
 */

/** Maximum failed password attempts before lockout */
export const MAX_PASSWORD_ATTEMPTS = 3;

/** Lockout duration in seconds (15 minutes) */
export const LOCKOUT_DURATION_SECONDS = 15 * 60;

/** Delay in seconds for each failed attempt (indexed by attempt number - 1) */
export const ATTEMPT_DELAYS_SECONDS = [0, 5, 10] as const;

/**
 * Get delay in seconds for a given attempt count
 * @param attempts - Number of failed attempts (1-based)
 * @returns Delay in seconds before responding
 */
export const getAttemptDelaySeconds = (attempts: number): number => {
  const index = Math.max(0, attempts - 1);
  const clampedIndex = Math.min(index, ATTEMPT_DELAYS_SECONDS.length - 1);
  return ATTEMPT_DELAYS_SECONDS[clampedIndex] ?? 0;
};

/**
 * Rate Limiting Constants for Password Reset by IP
 *
 * Rate limiting is done by IP (not by account) to prevent DoS attacks
 * where an attacker could block a legitimate user from resetting their password.
 * See: OWASP Cheat Sheet - Forgot Password
 */

/** Maximum password reset requests per IP per hour */
export const PASSWORD_RESET_IP_LIMIT = 5;

/** Password reset rate limit window in seconds (1 hour) */
export const PASSWORD_RESET_IP_WINDOW_SECONDS = 60 * 60;
