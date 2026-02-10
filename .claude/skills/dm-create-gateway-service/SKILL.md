---
name: dm-create-gateway-service
description: Create an Effect HTTP gateway service with boundary mappers that decode API DTOs into domain types. Web equivalent of the repository layer. Composes on create-service layout.
model: opus
---

# Create Gateway Service

Creates an Effect HTTP service with boundary mappers that decode API responses into domain types. This is the web equivalent of the repository layer — it ensures domain types are used throughout the application, never raw DTOs.

**Composes on the `create-service` layout** — same HTTP patterns, same layer composition, with boundary mapping added.

## Usage

```
/dm-create-gateway-service <FeatureName> --endpoints <list> --domain-types <list>
```

## Arguments

- `FeatureName`: The feature name in PascalCase (e.g., `Plan`, `Cycle`)
- `--endpoints`: Comma-separated endpoint operations (e.g., `list,getById,create,update,delete`)
- `--domain-types`: Comma-separated domain types to map to (e.g., `Plan,Period,PlanStatus`)

## When to Use

Use this skill instead of `create-service` when the feature has a domain layer (`domain/` directory with branded types, contracts, etc.). The gateway service adds boundary mappers that convert between API DTOs and domain types.

If the feature does NOT have a domain layer, use `create-service` instead.

## Application Service Relationship

The API client handles HTTP + boundary mapping only. For features with domain modeling, an **application service** (`{feature}-application.service.ts`) composes API client + FC and serves as the single entrypoint for actor programs:

```
Actor → Application Service → API Client (HTTP + boundary)
                            → FC (pure logic)
                            → API Client (persist)
```

API client `program*` exports are consumed by the application service, not directly by actors. For features without domain modeling (no `domain/` directory), actors consume API client programs directly.

## File Structure

```
web/src/views/{feature}/
├── domain/
│   ├── {feature}.model.ts      # Domain types (branded, entities, enums)
│   └── errors.ts               # Domain errors
└── services/
    └── {feature}.service.ts    # Gateway service (this file)
```

## Complete Gateway Service Template

```typescript
import { Data, Effect, Layer, Match } from 'effect';
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

// Import domain types
import type {
  {Resource},
  {Resource}Id,
  {Resource}Status,
} from '../domain';

// Import shared response schemas (DTOs)
import {
  {Resource}ResponseSchema,
  type {Resource}Response,
} from '@ketone/shared';

// ============================================
// 1. BOUNDARY MAPPERS (Data Seam)
// ============================================

/**
 * fromApiResponse
 *
 * API DTO → Domain (with validation)
 * Applied at the gateway boundary. May fail if DTO doesn't meet domain invariants.
 *
 * Checklist:
 * - [ ] Branded types applied during decode (IDs, constrained numbers)
 * - [ ] Enum values mapped to domain literals
 * - [ ] Dates parsed from ISO strings
 * - [ ] DTO type never exposed past this function
 */
const from{Resource}Response = (dto: {Resource}Response): {Resource} => ({
  id: {Resource}Id(dto.id),        // Brand.refined validates at boundary
  status: dto.status as {Resource}Status,
  // Map nested objects
  // periods: dto.periods.map(fromPeriodResponse),
  createdAt: new Date(dto.createdAt),
  updatedAt: new Date(dto.updatedAt),
});

// Alternative: Use S.decodeUnknownSync for stricter validation at boundary
// const from{Resource}ResponseStrict = (dto: {Resource}Response): {Resource} =>
//   S.decodeUnknownSync({Resource}DomainSchema)({
//     id: dto.id,
//     status: dto.status,
//     createdAt: dto.createdAt,
//     updatedAt: dto.updatedAt,
//   });

/**
 * toApiPayload
 *
 * Domain → API Payload (pure, always succeeds)
 * Used when sending data to the API.
 */
const to{Resource}Payload = (input: {CreateInput}): {CreatePayload} => ({
  // Map domain types to API payload shape
  // name: input.name,
  // fastingDuration: input.fastingDuration, // branded → number (transparent)
});

// ============================================
// 2. DOMAIN ERROR TYPES
// ============================================

// Domain-tagged errors (NOT HTTP errors)
// These are the errors the actor sees — never raw HTTP status codes

export class {Resource}NotFoundError extends Data.TaggedError('{Resource}NotFoundError')<{
  readonly message: string;
  readonly resourceId: string;
}> {}

export class {Resource}ValidationError extends Data.TaggedError('{Resource}ValidationError')<{
  readonly message: string;
}> {}

export class {Resource}ServerError extends Data.TaggedError('{Resource}ServerError')<{
  readonly message: string;
}> {}

// Error union for type safety
export type {Feature}ApiClientError =
  | {Resource}NotFoundError
  | {Resource}ValidationError
  | {Resource}ServerError;

// ============================================
// 3. RESPONSE HANDLERS
// ============================================

// Response handlers match on HTTP status and map to domain errors.
// Success paths decode the DTO, then apply boundary mapper.

const handleGet{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
  resourceId: string,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson({Resource}ResponseSchema)(response).pipe(
        Effect.map(from{Resource}Response), // ← BOUNDARY: DTO → Domain
      ),
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
      HttpClientResponse.schemaBodyJson(S.Array({Resource}ResponseSchema))(response).pipe(
        Effect.map((dtos) => dtos.map(from{Resource}Response)), // ← BOUNDARY: DTO[] → Domain[]
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

const handleCreate{Resource}Response = (
  response: HttpClientResponse.HttpClientResponse,
) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Created, () =>
      HttpClientResponse.schemaBodyJson({Resource}ResponseSchema)(response).pipe(
        Effect.map(from{Resource}Response), // ← BOUNDARY: DTO → Domain
      ),
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

// ============================================
// 4. SERVICE DEFINITION
// ============================================

// All methods return DOMAIN TYPES, never DTOs.
// The boundary mapper is the last step before returning.

export class {Feature}ApiClientService extends Effect.Service<{Feature}ApiClientService>()('{Feature}ApiClientService', {
  effect: Effect.gen(function* () {
    const authenticatedClient = yield* AuthenticatedHttpClient;

    return {
      // GET list — returns Domain[]
      list: () =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/{resources}`))
          .pipe(
            Effect.scoped,
            Effect.flatMap(handleList{Resources}Response),
          ),

      // GET single — returns Domain
      getById: (id: {Resource}Id) =>
        authenticatedClient
          .execute(HttpClientRequest.get(`${API_BASE_URL}/v1/{resources}/${id}`))
          .pipe(
            Effect.scoped,
            Effect.flatMap((response) => handleGet{Resource}Response(response, id)),
          ),

      // POST create — accepts domain input, returns Domain
      create: (input: {CreateInput}) =>
        HttpClientRequest.post(`${API_BASE_URL}/v1/{resources}`).pipe(
          HttpClientRequest.bodyJson(to{Resource}Payload(input)), // ← BOUNDARY: Domain → DTO
          Effect.flatMap((request) => authenticatedClient.execute(request)),
          Effect.scoped,
          Effect.flatMap(handleCreate{Resource}Response),
        ),
    };
  }),
  accessors: true,
}) {}

// ============================================
// 5. LAYER COMPOSITION
// ============================================

export const {Feature}ApiClientServiceLive = {Feature}ApiClientService.Default.pipe(
  Layer.provide(AuthenticatedHttpClientLive),
  Layer.provide(HttpClientWith401Interceptor),
  Layer.provide(HttpClientLive),
);

// ============================================
// 6. PROGRAM EXPORTS (for XState actors)
// ============================================

// Programs provide the full layer stack for consumption via runWithUi.
// For features with domain modeling, these programs are consumed by the APPLICATION
// service — actors import from application service, not API client.
// For features without domain modeling (no domain/ directory), actors consume these directly.
// All programs return DOMAIN TYPES.

export const programList{Resources} = () =>
  {Feature}ApiClientService.list().pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to list {resources}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}ApiClientService' }),
    Effect.provide({Feature}ApiClientServiceLive),
  );

export const programGet{Resource} = (id: {Resource}Id) =>
  {Feature}ApiClientService.getById(id).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to get {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}ApiClientService' }),
    Effect.provide({Feature}ApiClientServiceLive),
  );

export const programCreate{Resource} = (input: {CreateInput}) =>
  {Feature}ApiClientService.create(input).pipe(
    Effect.tapError((error) =>
      Effect.logError('Failed to create {resource}', { cause: extractErrorMessage(error) }),
    ),
    Effect.annotateLogs({ service: '{Feature}ApiClientService' }),
    Effect.provide({Feature}ApiClientServiceLive),
  );
```

## Boundary Mapping Patterns

### Simple Field Mapping

```typescript
const fromPlanResponse = (dto: PlanResponse): Plan => ({
  id: PlanId(dto.id),
  name: dto.name,
  status: dto.status as PlanStatus,
  startDate: new Date(dto.startDate),
  periods: dto.periods.map(fromPeriodResponse),
});
```

### Nested Object Mapping

```typescript
const fromPeriodResponse = (dto: PeriodResponse): Period => ({
  id: PeriodId(dto.id),
  fastingDuration: FastingDuration(dto.fastingDurationHours),
  eatingWindow: EatingWindow(dto.eatingWindowHours),
  startDate: new Date(dto.startDate),
  endDate: new Date(dto.endDate),
});
```

### Enum Mapping

```typescript
// When API uses different values than domain:
const mapApiStatus = (apiStatus: string): PlanStatus => {
  const mapping: Record<string, PlanStatus> = {
    in_progress: 'InProgress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return mapping[apiStatus] ?? 'InProgress';
};
```

### Payload Construction (Domain → API)

```typescript
const toCreatePlanPayload = (input: CreatePlanInput) => ({
  name: input.name,
  startDate: input.startDate.toISOString(),
  periods: input.periods.map((p) => ({
    fastingDurationHours: p.fastingDuration, // branded → number (transparent)
    eatingWindowHours: p.eatingWindow,
  })),
});
```

## Error Mapping Pattern

API-specific errors should be parsed from response body and mapped to domain errors:

```typescript
// Parse API error body for domain-specific information
const PlanApiErrorResponseSchema = S.Struct({
  _tag: S.String,
  message: S.String,
  planId: S.optional(S.String),
  currentState: S.optional(S.String),
});

const handleCancelResponse = (response: HttpClientResponse.HttpClientResponse) =>
  Match.value(response.status).pipe(
    Match.when(HttpStatus.Ok, () =>
      HttpClientResponse.schemaBodyJson(PlanResponseSchema)(response).pipe(Effect.map(fromPlanResponse)),
    ),
    Match.when(HttpStatus.Conflict, () =>
      HttpClientResponse.schemaBodyJson(PlanApiErrorResponseSchema)(response).pipe(
        Effect.flatMap((body) =>
          Match.value(body._tag).pipe(
            Match.when('PlanInvalidStateError', () =>
              Effect.fail(new PlanInvalidStateError({ message: body.message })),
            ),
            Match.when('ActiveCycleExistsError', () =>
              Effect.fail(new ActiveCycleExistsError({ message: body.message })),
            ),
            Match.orElse(() => Effect.fail(new PlanServerError({ message: body.message }))),
          ),
        ),
      ),
    ),
    Match.orElse(() =>
      handleServerErrorResponse(response).pipe(
        Effect.flatMap((error) => Effect.fail(new PlanServerError({ message: error.message }))),
      ),
    ),
  );
```

## Boundary Mapping Checklist

- [ ] `fromApiResponse()` decodes every field (branded IDs, dates, enums)
- [ ] `toApiPayload()` is pure — always succeeds, no validation needed
- [ ] DTO types (`*Response`) are NEVER exposed past the gateway service
- [ ] Branded types are applied during decode, not after
- [ ] All `program*` exports return domain types
- [ ] HTTP errors are mapped to `Data.TaggedError` domain errors
- [ ] Actor never sees raw HTTP status codes or `HttpClient` error types
- [ ] Response handlers apply boundary mapper in the success path
- [ ] Nested objects have their own boundary mappers

## Differences from `create-service`

| Aspect            | `create-service`                | `dm-create-gateway-service`        |
| ----------------- | ------------------------------- | ---------------------------------- |
| Return types      | Response schemas (DTOs)         | Domain types (branded, entities)   |
| Boundary mappers  | None                            | `fromApiResponse` + `toApiPayload` |
| Error types       | `S.TaggedError` (schema errors) | `Data.TaggedError` (domain errors) |
| Domain imports    | None                            | Imports from `../domain`           |
| Method signatures | `(id: string)`                  | `(id: ResourceId)` — branded types |

## Checklist

- [ ] Service named `{Feature}ApiClientService` (API Client, not Gateway — consumes API, doesn't route traffic)
- [ ] Created boundary mappers (`from*Response`, `to*Payload`)
- [ ] Created domain error types with `Data.TaggedError`
- [ ] Created response handlers with boundary mapper in success path
- [ ] Service methods accept and return domain types
- [ ] Layer composition with all dependencies
- [ ] Program exports provide service layer for application service (or actor if no domain layer)
- [ ] All programs have `Effect.tapError` for logging
- [ ] All programs have `Effect.annotateLogs({ service: '...' })`
- [ ] DTO types never leak past gateway boundary
- [ ] HTTP errors mapped to domain errors
- [ ] For features with domain modeling, application service composes this API client as single entrypoint
- [ ] API client `program*` exports consumed by application service, not directly by actors
