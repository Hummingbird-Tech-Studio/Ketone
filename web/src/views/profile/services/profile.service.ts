import { ServerError, ValidationError } from '@/services/http/errors';
import {
  API_BASE_URL,
  AuthenticatedHttpClient,
  AuthenticatedHttpClientLive,
  HttpClientLive,
  HttpClientRequest,
  HttpClientResponse,
  HttpClientWith401Interceptor,
  UnauthorizedError,
} from '@/services/http/http-client.service';
import { HttpStatus } from '@/shared/constants/http-status';
import type { HttpBodyError } from '@effect/platform/HttpBody';
import type { HttpClientError } from '@effect/platform/HttpClientError';
import { ProfileResponseSchema } from '@ketone/shared';
import { Effect, Layer, Match, Schema as S } from 'effect';

/**
 * Response Types
 */
export type SaveProfileSuccess = S.Schema.Type<typeof ProfileResponseSchema>;
export type SaveProfileError = HttpClientError | HttpBodyError | ValidationError | UnauthorizedError | ServerError;

/**
 * Shared Error Response Handlers
 */
const handleUnauthorizedResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap((body) => {
      const errorData = body as { message?: string };
      return Effect.fail(
        new UnauthorizedError({
          message: errorData.message || 'Unauthorized',
        }),
      );
    }),
  );

const handleServerErrorResponse = (response: HttpClientResponse.HttpClientResponse) =>
  response.json.pipe(
    Effect.flatMap((body) => {
      const errorData = body as { message?: string };
      return Effect.fail(
        new ServerError({
          message: errorData.message || `Server error: ${response.status}`,
        }),
      );
    }),
  );

/**
 * Handle Save Profile Response
 */
const handleSaveProfileResponse = (
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<SaveProfileSuccess, SaveProfileError> =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(ProfileResponseSchema)(response).pipe(
        Effect.mapError(
          (error) =>
            new ValidationError({
              message: 'Invalid response from server',
              issues: [error],
            }),
        ),
      ),
    ),
    Match.when(HttpStatus.Unauthorized, () => handleUnauthorizedResponse(response)),
    Match.orElse(() => handleServerErrorResponse(response)),
  );

/**
 * Profile Service
 */
export class ProfileService extends Effect.Service<ProfileService>()('ProfileService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      /**
       * Save (create or update) user profile
       * @param data - Profile data to save
       */
      saveProfile: (data: {
        name?: string | null;
        dateOfBirth?: string | null;
      }): Effect.Effect<SaveProfileSuccess, SaveProfileError> =>
        HttpClientRequest.put(`${API_BASE_URL}/v1/profile`).pipe(
          HttpClientRequest.bodyJson(data),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleSaveProfileResponse),
        ),
    };
  }),
  dependencies: [AuthenticatedHttpClient.Default],
  accessors: true,
}) {}

/**
 * Live implementation of ProfileService
 */
export const ProfileServiceLive = ProfileService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

/**
 * Program to save user profile
 */
export const saveProfileProgram = (data: { name?: string | null; dateOfBirth?: string | null }) =>
  Effect.gen(function* () {
    const profileService = yield* ProfileService;
    return yield* profileService.saveProfile(data);
  }).pipe(Effect.provide(ProfileServiceLive));
