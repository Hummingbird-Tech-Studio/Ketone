/**
 * API server base URL
 * Can be overridden via API_BASE_URL environment variable
 * Default: http://localhost:3000
 */
export const API_BASE_URL = Bun.env.API_BASE_URL || 'http://localhost:3000';
