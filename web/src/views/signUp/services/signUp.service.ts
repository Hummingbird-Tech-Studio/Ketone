import { ServerError, ValidationError } from '@/services/http/errors';
import {
  API_BASE_URL,
  HttpClient,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { SignupResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Sign-Up Specific Error Types
 */
export class UserAlreadyExistsError extends S.TaggedError<UserAlreadyExistsError>()('UserAlreadyExistsError', {
  message: S.String,
  email: S.String,
}) {}

/**
 * Response Types
 */
export type SignUpSuccess = SignupResponseSchema;
export type SignUpError = HttpClientError | HttpBodyError | ValidationError | UserAlreadyExistsError | ServerError;

const handleSignUpResponse = (
  response: HttpClientResponse.HttpClientResponse,
  email: string,
): Effect.Effect<SignUpSuccess, SignUpError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson(SignupResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Conflict, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string; email?: string };
          return Effect.fail(
            new UserAlreadyExistsError({
              message: errorData.message || 'User with this email already exists',
              email: errorData.email || email,
            }),
          );
        }),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new ValidationError({
              message: errorData.message || 'Invalid email or password',
            }),
          );
        }),
      ),
    ),
    Match.orElse(() =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new ServerError({
              message: errorData.message || `Server error: ${response.status}`,
            }),
          );
        }),
      ),
    ),
  );

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
        HttpClientRequest.post('/auth/signup').pipe(
          HttpClientRequest.bodyJson({ email, password }),
          Effect.flatMap((request) => client.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleSignUpResponse(response, email)),
        ),
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
 */
export const programSignUp = (email: string, password: string) =>
  Effect.gen(function* () {
    const signUpService = yield* SignUpService;
    return yield* signUpService.signUp(email, password);
  }).pipe(Effect.provide(SignUpServiceLive));
