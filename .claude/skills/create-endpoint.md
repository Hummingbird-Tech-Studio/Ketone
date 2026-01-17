---
name: create-endpoint
description: Create a new API endpoint with all required files (api.ts, handler.ts, schemas). Use when asked to create, add, or implement a new API endpoint.
---

# Create API Endpoint

When creating a new API endpoint, follow this structure and patterns exactly.

## File Structure

For a new endpoint in feature `{feature}`:

```
api/src/features/{feature}/
├── api/
│   ├── {feature}-api.ts           # Endpoint contract
│   ├── {feature}-api-handler.ts   # Handler implementation
│   └── schemas/
│       ├── requests.ts            # Request schemas
│       ├── errors.ts              # Error schemas
│       └── index.ts               # Barrel export
```

## Step 1: Create Request Schema (`schemas/requests.ts`)

```typescript
import { Schema as S } from 'effect';

export class Create{Resource}Schema extends S.Class<Create{Resource}Schema>('Create{Resource}Schema')({
  name: S.String.pipe(
    S.minLength(1, { message: () => 'Name is required' }),
    S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
  ),
  // Add other fields as needed
}) {}

export class Update{Resource}Schema extends S.Class<Update{Resource}Schema>('Update{Resource}Schema')({
  name: S.optional(S.String),
  // Add other optional fields
}) {}
```

## Step 2: Create Error Schemas (`schemas/errors.ts`)

```typescript
import { Schema as S } from 'effect';

export class {Resource}NotFoundErrorSchema extends S.TaggedError<{Resource}NotFoundErrorSchema>()(
  '{Resource}NotFoundError',
  {
    message: S.String,
    resourceId: S.UUID,
  },
) {}

export class {Resource}RepositoryErrorSchema extends S.TaggedError<{Resource}RepositoryErrorSchema>()(
  '{Resource}RepositoryError',
  {
    message: S.String,
    cause: S.optional(S.Unknown),
  },
) {}
```

## Step 3: Create Barrel Export (`schemas/index.ts`)

```typescript
export * from './errors';
export * from './requests';

// If responses from shared:
export { {Resource}ResponseSchema } from '@ketone/shared';
```

## Step 4: Create API Contract (`{feature}-api.ts`)

```typescript
import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform';
import { Schema as S } from 'effect';
import {
  Create{Resource}Schema,
  Update{Resource}Schema,
  {Resource}NotFoundErrorSchema,
  {Resource}RepositoryErrorSchema,
} from './schemas';
import { Authentication, UnauthorizedErrorSchema } from '../../auth/api/middleware';

export class {Feature}ApiGroup extends HttpApiGroup.make('{feature}')
  // GET list
  .add(
    HttpApiEndpoint.get('list{Resources}', '/v1/{resources}')
      .addSuccess(S.Array({Resource}ResponseSchema))
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError({Resource}RepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  // GET single
  .add(
    HttpApiEndpoint.get('get{Resource}', '/v1/{resources}/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess({Resource}ResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError({Resource}NotFoundErrorSchema, { status: 404 })
      .middleware(Authentication),
  )
  // POST create
  .add(
    HttpApiEndpoint.post('create{Resource}', '/v1/{resources}')
      .setPayload(Create{Resource}Schema)
      .addSuccess({Resource}ResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError({Resource}RepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  // PATCH update
  .add(
    HttpApiEndpoint.patch('update{Resource}', '/v1/{resources}/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .setPayload(Update{Resource}Schema)
      .addSuccess({Resource}ResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError({Resource}NotFoundErrorSchema, { status: 404 })
      .middleware(Authentication),
  )
  // DELETE
  .add(
    HttpApiEndpoint.del('delete{Resource}', '/v1/{resources}/:id')
      .setPath(S.Struct({ id: S.UUID }))
      .addSuccess(S.Void, { status: 204 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError({Resource}NotFoundErrorSchema, { status: 404 })
      .middleware(Authentication),
  ) {}
```

## Step 5: Create Handler (`{feature}-api-handler.ts`)

```typescript
import { HttpApiBuilder } from '@effect/platform';
import { Effect } from 'effect';
import { Api } from '../../../api';
import { {Feature}Service } from '../services';
import {
  {Resource}NotFoundErrorSchema,
  {Resource}RepositoryErrorSchema,
} from './schemas';
import { CurrentUser } from '../../auth/api/middleware';

export const {Feature}ApiLive = HttpApiBuilder.group(Api, '{feature}', (handlers) =>
  Effect.gen(function* () {
    const {feature}Service = yield* {Feature}Service;

    return handlers
      .handle('list{Resources}', () =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('GET /v1/{resources} - Request received');

          const resources = yield* {feature}Service.list(userId).pipe(
            Effect.catchTags({
              {Resource}RepositoryError: (e) =>
                Effect.fail(new {Resource}RepositoryErrorSchema({ message: e.message })),
            }),
          );

          return resources;
        }).pipe(Effect.annotateLogs({ handler: '{feature}.list{Resources}' })),
      )
      .handle('get{Resource}', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`GET /v1/{resources}/${path.id} - Request received`);

          const resource = yield* {feature}Service.getById(userId, path.id).pipe(
            Effect.catchTags({
              {Resource}NotFoundError: (e) =>
                Effect.fail(new {Resource}NotFoundErrorSchema({ message: e.message, resourceId: path.id })),
              {Resource}RepositoryError: (e) =>
                Effect.fail(new {Resource}RepositoryErrorSchema({ message: e.message })),
            }),
          );

          return resource;
        }).pipe(Effect.annotateLogs({ handler: '{feature}.get{Resource}' })),
      )
      .handle('create{Resource}', ({ payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo('POST /v1/{resources} - Request received');

          const resource = yield* {feature}Service.create(userId, payload).pipe(
            Effect.catchTags({
              {Resource}RepositoryError: (e) =>
                Effect.fail(new {Resource}RepositoryErrorSchema({ message: e.message })),
            }),
          );

          yield* Effect.logInfo(`Resource created with id: ${resource.id}`);
          return resource;
        }).pipe(Effect.annotateLogs({ handler: '{feature}.create{Resource}' })),
      )
      .handle('update{Resource}', ({ path, payload }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`PATCH /v1/{resources}/${path.id} - Request received`);

          const resource = yield* {feature}Service.update(userId, path.id, payload).pipe(
            Effect.catchTags({
              {Resource}NotFoundError: (e) =>
                Effect.fail(new {Resource}NotFoundErrorSchema({ message: e.message, resourceId: path.id })),
              {Resource}RepositoryError: (e) =>
                Effect.fail(new {Resource}RepositoryErrorSchema({ message: e.message })),
            }),
          );

          return resource;
        }).pipe(Effect.annotateLogs({ handler: '{feature}.update{Resource}' })),
      )
      .handle('delete{Resource}', ({ path }) =>
        Effect.gen(function* () {
          const currentUser = yield* CurrentUser;
          const userId = currentUser.userId;

          yield* Effect.logInfo(`DELETE /v1/{resources}/${path.id} - Request received`);

          yield* {feature}Service.delete(userId, path.id).pipe(
            Effect.catchTags({
              {Resource}NotFoundError: (e) =>
                Effect.fail(new {Resource}NotFoundErrorSchema({ message: e.message, resourceId: path.id })),
              {Resource}RepositoryError: (e) =>
                Effect.fail(new {Resource}RepositoryErrorSchema({ message: e.message })),
            }),
          );

          yield* Effect.logInfo(`Resource ${path.id} deleted`);
        }).pipe(Effect.annotateLogs({ handler: '{feature}.delete{Resource}' })),
      );
  }),
);
```

## Step 6: Register in `api/src/api.ts`

```typescript
import { {Feature}ApiGroup } from './features/{feature}/api/{feature}-api';

export const Api = HttpApi.make('api')
  .add({Feature}ApiGroup)  // Add new group
  // ... existing groups
```

## Step 7: Register Handler in `api/src/index.ts`

```typescript
import { {Feature}ApiLive } from './features/{feature}/api/{feature}-api-handler';
import { {Feature}Service } from './features/{feature}/services';

// Add to HandlersLive
const HandlersLive = Layer.mergeAll(
  {Feature}ApiLive,
  // ... existing handlers
);

// Add to ServiceLayers
const ServiceLayers = Layer.mergeAll(
  {Feature}Service.Default,
  // ... existing services
);
```

## Checklist

- [ ] Created `schemas/requests.ts` with validation
- [ ] Created `schemas/errors.ts` with S.TaggedError
- [ ] Created `schemas/index.ts` barrel export
- [ ] Created `{feature}-api.ts` with HttpApiGroup
- [ ] Created `{feature}-api-handler.ts` with handlers
- [ ] Registered ApiGroup in `api/src/api.ts`
- [ ] Registered Handler in `api/src/index.ts`
- [ ] All handlers use `Effect.annotateLogs({ handler: '...' })`
- [ ] All handlers log request start
- [ ] Error mapping with `Effect.catchTags`
