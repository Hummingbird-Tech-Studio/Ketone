// Re-export base from shared
export {
  API_BASE_URL,
  HttpClientLive,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  type HttpClientError,
} from '@ketone/shared/services/http/http-client.service';

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
