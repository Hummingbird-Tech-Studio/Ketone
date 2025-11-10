import {
  API_BASE_URL,
  HttpClient,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { Effect, Layer, Schema as S } from 'effect';

/**
 * Sign-Up Specific Error Types
 */
export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class UserAlreadyExistsError extends S.TaggedError<UserAlreadyExistsError>()('UserAlreadyExistsError', {
  message: S.String,
  email: S.String,
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

/**
 * Response Types
 */
export class UserResponse extends S.Class<UserResponse>('UserResponse')({
  id: S.String,
  email: S.String,
  createdAt: S.DateFromString,
  updatedAt: S.DateFromString,
}) {}

export class SignUpSuccess extends S.Class<SignUpSuccess>('SignUpSuccess')({
  user: UserResponse,
}) {}

/**
 * Union type for all possible errors
 */
export type SignUpError = HttpClientError | HttpBodyError | ValidationError | UserAlreadyExistsError | ServerError;

/**
 * Sign Up Service
 */
export class SignUpService extends Effect.Service<SignUpService>()('SignUpService', {
  effect: Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;
    const client = defaultClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(API_BASE_URL)));

    return {
      /**
       * Register a new user
       * @param email - User email
       * @param password - User password
       */
      signUp: (email: string, password: string): Effect.Effect<SignUpSuccess, SignUpError> =>
        Effect.gen(function* () {
          const request = yield* HttpClientRequest.post('/auth/signup').pipe(
            HttpClientRequest.bodyJson({ email, password }),
          );
          const response = yield* client.execute(request).pipe(Effect.scoped);

          if (response.status === 201) {
            return yield* HttpClientResponse.schemaBodyJson(SignUpSuccess)(response).pipe(
              Effect.mapError(
                (error) =>
                  new ValidationError({
                    message: 'Invalid response from server',
                    issues: [error],
                  }),
              ),
            );
          }

          const body = yield* response.json;

          if (response.status === 409) {
            const errorData = body as { message?: string; email?: string };
            return yield* Effect.fail(
              new UserAlreadyExistsError({
                message: errorData.message || 'User with this email already exists',
                email: errorData.email || email,
              }),
            );
          }

          if (response.status === 400) {
            const errorData = body as { message?: string };
            return yield* Effect.fail(
              new ValidationError({
                message: errorData.message || 'Invalid email or password',
              }),
            );
          }

          const errorData = body as { message?: string };
          return yield* Effect.fail(
            new ServerError({
              message: errorData.message || `Server error: ${response.status}`,
            }),
          );
        }),
    };
  }),
  accessors: true,
}) {}

/**
 * Live implementation of SignUpService
 * Provides HttpClient dependency
 */
export const SignUpServiceLive = SignUpService.Default.pipe(Layer.provide(HttpClientLive));

/**
 * Program to sign up a new user
 * Provides all required dependencies
 */
export const programSignUp = (email: string, password: string) =>
  Effect.gen(function* () {
    const signUpService = yield* SignUpService;
    return yield* signUpService.signUp(email, password);
  }).pipe(Effect.provide(SignUpServiceLive));
