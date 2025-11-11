import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import type { HttpClientError } from '@effect/platform';

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
