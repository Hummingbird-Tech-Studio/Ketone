import { Schema as S } from 'effect';

/**
 * Schema for IANA timezone identifiers.
 * Supports:
 * - Simple: America/New_York, Europe/London
 * - Multi-segment: America/Argentina/Buenos_Aires, America/Kentucky/Louisville
 * - Hyphens: America/Port-au-Prince, Pacific/Pago_Pago
 * - Numbers/signs: Etc/GMT+5, Etc/GMT-10
 */
export const TimezoneSchema = S.String.pipe(
  S.pattern(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z][A-Za-z0-9_+-]*)+$/, {
    message: () => 'Invalid timezone format. Expected IANA timezone (e.g., America/New_York)',
  }),
);
