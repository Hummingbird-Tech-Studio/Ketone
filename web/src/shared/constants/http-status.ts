/**
 * HTTP Status Code Constants
 *
 * Provides named constants for HTTP status codes to improve code readability
 * and avoid magic numbers throughout the application.
 */
export const HttpStatus = {
  // Success codes
  Ok: 200,
  Created: 201,
  NoContent: 204,

  // Client error codes
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  UnprocessableEntity: 422,
  TooManyRequests: 429,

  // Server error codes
  InternalServerError: 500,
} as const;

export type HttpStatusCode = typeof HttpStatus[keyof typeof HttpStatus];
