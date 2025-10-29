/**
 * Orleans sidecar base URL
 * Used by production code to communicate with Orleans cluster
 */
export const ORLEANS_BASE_URL = Bun.env.ORLEANS_BASE_URL || 'http://localhost:5174';

/**
 * API server base URL
 * Can be overridden via API_BASE_URL environment variable
 * Default: http://localhost:3000
 */
export const API_BASE_URL = Bun.env.API_BASE_URL || 'http://localhost:3000';
