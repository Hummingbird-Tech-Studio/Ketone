import type { HttpClientError } from '@effect/platform';
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';

/**
 * API Base URL Configuration
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * HttpClient Layer
 */
export const HttpClientLive = FetchHttpClient.layer;

/**
 * Export HttpClient and utilities for use in services
 */
export { HttpClient, HttpClientRequest, HttpClientResponse };
export type { HttpClientError };

/**
 * Export HTTP Interceptor utilities
 */
export { create401Interceptor, HttpClientWith401Interceptor } from './http-interceptor';

/**
 * Export Authenticated HTTP Client
 */
export { AuthenticatedHttpClient, AuthenticatedHttpClientLive } from './authenticated-http-client.service';

/**
 * Export error types and utilities
 */
export {
  extractErrorMessage,
  handleInvalidPasswordResponse,
  handleServerErrorResponse,
  handleTooManyRequestsResponse,
  handleUnauthorizedResponse,
  handleValidationErrorResponse,
  InvalidPasswordError,
  ServerError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from './errors';
