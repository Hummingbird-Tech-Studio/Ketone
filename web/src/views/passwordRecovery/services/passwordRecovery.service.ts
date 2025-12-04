import { handleServerErrorResponse, ServerError, ValidationError } from '@/services/http/errors';
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
import { ForgotPasswordResponseSchema, ResetPasswordResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Password Recovery Specific Error Types
 */
export class PasswordResetTokenInvalidError extends S.TaggedError<PasswordResetTokenInvalidError>()(
  'PasswordResetTokenInvalidError',
  {
    message: S.String,
  },
) {}

/**
 * Response Types
 */
export type ForgotPasswordSuccess = ForgotPasswordResponseSchema;
export type ForgotPasswordError = HttpClientError | HttpBodyError | ValidationError | ServerError;

export type ResetPasswordSuccess = ResetPasswordResponseSchema;
export type ResetPasswordError =
  | HttpClientError
  | HttpBodyError
  | ValidationError
  | PasswordResetTokenInvalidError
  | ServerError;

/**
 * Handle Forgot Password Response
 */
const handleForgotPasswordResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ForgotPasswordSuccess, ForgotPasswordError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(ForgotPasswordResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body) => {
          const errorData = body as { message?: string };
          return Effect.fail(
            new ValidationError({
              message: errorData.message || 'Invalid email format',
            }),
          );
        }),
      ),
    ),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Handle Reset Password Response
 */
const handleResetPasswordResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<ResetPasswordSuccess, ResetPasswordError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(ResetPasswordResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.BadRequest, () =>
      response.json.pipe(
        Effect.flatMap((body): Effect.Effect<never, PasswordResetTokenInvalidError | ValidationError> => {
          const errorData = body as { _tag?: string; message?: string };
          if (errorData._tag === 'PasswordResetTokenInvalidError') {
            return Effect.fail(
              new PasswordResetTokenInvalidError({
                message: errorData.message || 'Invalid or expired password reset token',
              }),
            );
          }
          return Effect.fail(
            new ValidationError({
              message: errorData.message || 'Invalid password format',
            }),
          );
        }),
      ),
    ),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Password Recovery Service
 */
export class PasswordRecoveryService extends Effect.Service<PasswordRecoveryService>()('PasswordRecoveryService', {
  effect: Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;
    const client = defaultClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(API_BASE_URL)));

    return {
      /**
       * Request a password reset email
       * @param email - User email address
       */
      forgotPassword: (email: string): Effect.Effect<ForgotPasswordSuccess, ForgotPasswordError> =>
        HttpClientRequest.post('/auth/forgot-password').pipe(
          HttpClientRequest.bodyJson({ email }),
          Effect.flatMap((request) => client.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleForgotPasswordResponse(response)),
        ),

      /**
       * Reset password using a token
       * @param token - Password reset token
       * @param password - New password
       */
      resetPassword: (token: string, password: string): Effect.Effect<ResetPasswordSuccess, ResetPasswordError> =>
        HttpClientRequest.post('/auth/reset-password').pipe(
          HttpClientRequest.bodyJson({ token, password }),
          Effect.flatMap((request) => client.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleResetPasswordResponse(response)),
        ),
    };
  }),
  accessors: true,
}) {}

/**
 * Live implementation of PasswordRecoveryService
 * Provides HttpClient dependency
 */
export const PasswordRecoveryServiceLive = PasswordRecoveryService.Default.pipe(Layer.provide(HttpClientLive));

/**
 * Program to request password reset email
 */
export const programForgotPassword = (email: string) =>
  Effect.gen(function* () {
    const passwordRecoveryService = yield* PasswordRecoveryService;
    return yield* passwordRecoveryService.forgotPassword(email);
  }).pipe(Effect.provide(PasswordRecoveryServiceLive));

/**
 * Program to reset password with token
 */
export const programResetPassword = (token: string, password: string) =>
  Effect.gen(function* () {
    const passwordRecoveryService = yield* PasswordRecoveryService;
    return yield* passwordRecoveryService.resetPassword(token, password);
  }).pipe(Effect.provide(PasswordRecoveryServiceLive));
