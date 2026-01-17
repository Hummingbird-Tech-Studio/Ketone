---
name: create-service
description: Create a new HTTP service for the web package using Effect. Use when asked to create, add, or implement a new service that consumes API endpoints.
---

# Create Web HTTP Service

When creating a new HTTP service for the web package, follow this structure and patterns exactly.

## File Structure

```
web/src/views/{feature}/services/
└── {feature}.service.ts    # HTTP service with Effect
```

## Complete Service Template

```typescript
import { Effect, Layer, Match } from 'effect';
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from '@effect/platform';
import { Schema as S } from 'effect';
import {
  API_BASE_URL,
  HttpClientLive,
  HttpStatus,
  handleServerErrorResponse,
  handleValidationErrorResponse,
} from '@/services/http/http-client.service';
import {
  AuthenticatedHttpClient,
  AuthenticatedHttpClientLive,
} from '@/services/http/authenticated-http-client.service';
import { HttpClientWith401Interceptor } from '@/services/http/http-interceptor';
import { extractErrorMessage } from '@/utils/errors';

// ============================================
// 1. RESPONSE SCHEMAS
// ============================================

const {Resource}ResponseSchema = S.Struct({
  id: S.UUID,
  name: S.String,
  createdAt: S.String,
  updatedAt: S.String,
});

type {Resource}Response = S.Schema.Type<typeof {Resource}ResponseSchema>;

const {Resource}ListResponseSchema = S.Array({Resource}ResponseSchema);

// ============================================
// 2. ERROR TYPES
// ============================================

export class {Resource}NotFoundError extends S.TaggedError<{Resource}NotFoundError>()(
  '{Resource}NotFoundError',
  {
    message: S.String,
    resourceId: S.String,
  },
) {}

export class {Resource}ValidationError extends S.TaggedError<{Resource}ValidationError>()(
  '{Resource}ValidationError',
  {
    message: S.String,
    field: S.optional(S.String),
  },
) {}

export class {Resource}ServerError extends S.TaggedError<{Resource}ServerError>()(
  '{Resource}ServerError',
  {
    message: S.String,
  },
) {}

// Error union for type safety
export type {Feature}ServiceError =
  | {Resource}NotFoundError
  | {Resource}ValidationError
  | {Resource}ServerError;

// ============================================
// 3. RESPONSE HANDLERS
// ============================================

const handleGet{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
  resourceId: string,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson({Resource}ResponseSchema)(response),
    ),
    Match.when(HttpStatus.NotFound, () =>
      Effect.fail(
        new {Resource}NotFoundError({
          message: '{Resource} not found',
          resourceId,
        }),
      ),
    ),
    Match.when(HttpStatus.UnprocessableEntity, () =>
      handleValidationErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ValidationError({ message: error.message })),
        ),
      ),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ServerError({ message: error.message })),
        ),
      ),
    ),
  );

const handleList{Resources}Response = (
  response: HttpClientResponse.HttpClientResponse,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson({Resource}ListResponseSchema)(response),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ServerError({ message: error.message })),
        ),
      ),
    ),
  );

const handleCreate{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson({Resource}ResponseSchema)(response),
    ),
    Match.when(HttpStatus.Conflict, () =>
      Effect.fail(
        new {Resource}ValidationError({
          message: '{Resource} already exists',
        }),
      ),
    ),
    Match.when(HttpStatus.UnprocessableEntity, () =>
      handleValidationErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ValidationError({ message: error.message })),
        ),
      ),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ServerError({ message: error.message })),
        ),
      ),
    ),
  );

const handleUpdate{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
  resourceId: string,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson({Resource}ResponseSchema)(response),
    ),
    Match.when(HttpStatus.NotFound, () =>
      Effect.fail(
        new {Resource}NotFoundError({
          message: '{Resource} not found',
          resourceId,
        }),
      ),
    ),
    Match.when(HttpStatus.UnprocessableEntity, () =>
      handleValidationErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ValidationError({ message: error.message })),
        ),
      ),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ServerError({ message: error.message })),
        ),
      ),
    ),
  );

const handleDelete{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
  resourceId: string,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.NoContent, () => Effect.void),
    Match.when(HttpStatus.NotFound, () =>
      Effect.fail(
        new {Resource}NotFoundError({
          message: '{Resource} not found',
          resourceId,
        }),
      ),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) =>
          Effect.fail(new {Resource}ServerError({ message: error.message })),
        ),
      ),
    ),
  );

// ============================================
// 4. SERVICE DEFINITION
// ============================================

export class {Feature}Service extends Effect.Service<{Feature}Service>()('{Feature}Service', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      // GET list
      list: () =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/{resources}`))
          .pipe(
            Effect.scoped,
            Effect.flatMap(handleList{Resources}Response),
          ),

      // GET single
      getById: (id: string) =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/{resources}/${id}`))
          .pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleGet{Resource}Response(response, id)),
          ),

      // POST create
      create: (data: { name: string }) =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/{resources}`).pipe(
          HttpClientRequest.bodyJson(data),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleCreate{Resource}Response),
        ),

      // PATCH update
      update: (id: string, data: { name?: string }) =>
        HttpClientRequest.patch(`${API_BASE_URL}/v1/{resources}/${id}`).pipe(
          HttpClientRequest.bodyJson(data),
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap((response) => handleUpdate{Resource}Response(response, id)),
        ),

      // DELETE
      delete: (id: string) =>
        authenticatedClient
          .execute(HttpClientRequest.del(`${API_BASE_URL}/v1/{resources}/${id}`))
          .pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleDelete{Resource}Response(response, id)),
          ),
    };
  }),
  accessors: true,
}) {}

// ============================================
// 5. LAYER COMPOSITION
// ============================================

export const {Feature}ServiceLive = {Feature}Service.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

// ============================================
// 6. PROGRAM EXPORTS (for XState actors)
// ============================================

export const programList{Resources} = () =>
  {Feature}Service.list().pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to list {resources}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}Service' }),
    Effect.provide({Feature}ServiceLive),
  );

export const programGet{Resource} = (id: string) =>
  {Feature}Service.getById(id).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to get {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}Service' }),
    Effect.provide({Feature}ServiceLive),
  );

export const programCreate{Resource} = (data: { name: string }) =>
  {Feature}Service.create(data).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to create {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}Service' }),
    Effect.provide({Feature}ServiceLive),
  );

export const programUpdate{Resource} = (id: string, data: { name?: string }) =>
  {Feature}Service.update(id, data).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to update {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}Service' }),
    Effect.provide({Feature}ServiceLive),
  );

export const programDelete{Resource} = (id: string) =>
  {Feature}Service.delete(id).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to delete {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}Service' }),
    Effect.provide({Feature}ServiceLive),
  );
```

## Usage in XState Actor

```typescript
import { programGet{Resource}, programCreate{Resource} } from '../services/{feature}.service';
import { runWithUi } from '@/utils/effects/helpers';

const load{Resource}Logic = fromCallback<EventObject, { id: string }>(
  ({ sendBack, input }) =>
    runWithUi(
      programGet{Resource}(input.id),
      (result) => sendBack({ type: Event.ON_SUCCESS, result }),
      (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
    ),
);
```

## HTTP Status Constants

Available in `http-client.service.ts`:

```typescript
HttpStatus.Ok; // 200
HttpStatus.Created; // 201
HttpStatus.NoContent; // 204
HttpStatus.BadRequest; // 400
HttpStatus.Unauthorized; // 401
HttpStatus.NotFound; // 404
HttpStatus.Conflict; // 409
HttpStatus.UnprocessableEntity; // 422
HttpStatus.TooManyRequests; // 429
HttpStatus.InternalServerError; // 500
```

## Public Service (No Auth)

For services that don't require authentication:

```typescript
export class Public{Feature}Service extends Effect.Service<Public{Feature}Service>()('Public{Feature}Service', {
  effect: Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;
    const client = defaultClient.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(API_BASE_URL)),
    );

    return {
      getPublicData: () =>
        client.execute(HttpClientRequest.get('/v1/public/{resources}')).pipe(
          Effect.scoped,
          Effect.flatMap(handleResponse),
        ),
    };
  }),
  accessors: true,
}) {}

export const Public{Feature}ServiceLive = Public{Feature}Service.Default.pipe(
  Layer.provide(HttpClientLive),
);
```

## Checklist

- [ ] Created response schemas with `S.Struct`
- [ ] Created error types with `S.TaggedError`
- [ ] Created error union type for type safety
- [ ] Created response handlers with `Match.value().pipe()`
- [ ] Created service class with `Effect.Service`
- [ ] Used `authenticatedClient` for protected endpoints
- [ ] All requests use `Effect.scoped` for resource cleanup
- [ ] Created layer composition with all dependencies
- [ ] Created `program*` exports for XState integration
- [ ] All programs have `Effect.tapError` for logging
- [ ] All programs have `Effect.annotateLogs({ service: '...' })`
- [ ] All programs provide the service layer
