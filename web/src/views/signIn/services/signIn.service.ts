import {
  API_BASE_URL,
  HttpClient,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
} from '@/services/http/http-client.service';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { LoginResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Sign-In Specific Error Types
 */
export class ValidationError extends S.TaggedError<ValidationError>()('ValidationError', {
  message: S.String,
  issues: S.optional(S.Array(S.Unknown)),
}) {}

export class InvalidCredentialsError extends S.TaggedError<InvalidCredentialsError>()('InvalidCredentialsError', {
  message: S.String,
}) {}

export class ServerError extends S.TaggedError<ServerError>()('ServerError', {
  message: S.String,
}) {}

/**
 * Response Types
 */
export type SignInSuccess = LoginResponseSchema;
export type SignInError = HttpClientError | HttpBodyError | ValidationError | InvalidCredentialsError | ServerError;

const handleSignInResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<SignInSuccess, SignInError> =>
  Match.value(response.status).pipe(
    Match.when(200, () =>
      HttpClientResponse.schemaBodyJson(LoginResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(401, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new InvalidCredentialsError({
              message: errorData.message || 'Invalid email or password',
            }),
          );
        }),
      ),
    ),
    Match.when(400, () =>
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
 * Sign In Service
 */
export class SignInService extends Effect.Service<SignInService>()('SignInService', {
  effect: Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;
    const client = defaultClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(API_BASE_URL)));

    return {
      /**
       * Authenticate a user
       * @param email - User email
       * @param password - User password
       */
      signIn: (email: string, password: string): Effect.Effect<SignInSuccess, SignInError> =>
        HttpClientRequest.post('/auth/login').pipe(
          HttpClientRequest.bodyJson({ email, password }),
          Effect.flatMap((request) => client.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleSignInResponse(response)),
        ),
    };
  }),
  accessors: true,
}) {}

/**
 * Live implementation of SignInService
 * Provides HttpClient dependency
 */
export const SignInServiceLive = SignInService.Default.pipe(Layer.provide(HttpClientLive));

/**
 * Program to sign in a user
 */
export const programSignIn = (email: string, password: string) =>
  Effect.gen(function* () {
    const signInService = yield* SignInService;
    return yield* signInService.signIn(email, password);
  }).pipe(Effect.provide(SignInServiceLive));
