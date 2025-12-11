# Project Guidelines

## Language

All code, comments, MD files, etc. should be in English.

## Effect References

For any questions about the Effect API or recommended practices, check the `Context/Effect` folder at the project root. It contains the Effect repository with API documentation and references for all Effect libraries.

## Shared Package

The `shared/` directory (`@ketone/shared`) contains code shared between API and web:

- **Schemas**: `EmailSchema`, `PasswordSchema`, response schemas for auth/cycle/profile
- **Constants**: Rate limiting values, password attempt limits
- **Types**: Shared TypeScript types

```typescript
import {
  EmailSchema,
  PasswordSchema,
  CycleResponseSchema,
} from '@ketone/shared';
```

Always check `shared/` before creating new schemas to avoid duplication.

---

# API Development Guidelines

## Feature Structure

```
api/src/features/{feature}/
├── api/
│   ├── {feature}-api.ts           # Endpoint definitions
│   ├── {feature}-api-handler.ts   # Handler implementations
│   ├── schemas/                   # Request/Response/Error schemas
│   └── __tests__/                 # Integration tests
├── domain/                        # Business types and errors
├── services/                      # Business logic
├── repositories/                  # Data access
└── index.ts                       # Barrel exports
```

## Input Validation

**All validation happens in schemas using Effect Schema.** The framework validates automatically before reaching handlers.

### Request Schemas

```typescript
// api/schemas/requests.ts
export class CreateRequestSchema extends S.Class<CreateRequestSchema>(
  'CreateRequest'
)({
  email: EmailSchema, // Use shared schemas
  name: S.String.pipe(
    S.minLength(2, { message: () => 'Name must be at least 2 characters' }),
    S.maxLength(100, { message: () => 'Name must be at most 100 characters' })
  ),
  age: S.Number.pipe(
    S.int({ message: () => 'Age must be an integer' }),
    S.greaterThanOrEqualTo(18, {
      message: () => 'Must be at least 18 years old',
    })
  ),
  status: S.Literal('active', 'inactive'), // Enums
  metadata: S.optional(S.Record({ key: S.String, value: S.Unknown })), // Optional fields
}) {}
```

### Reusable Schemas

Define common schemas in `domain/types.ts`:

```typescript
export const EmailSchema = S.String.pipe(
  S.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
    message: () => 'Invalid email format',
  }),
  S.transform(S.String, {
    decode: (s) => s.toLowerCase().trim(),
    encode: (s) => s,
  })
);

export const UUIDSchema = S.UUID;
export const PositiveNumber = S.Number.pipe(S.positive());
```

### Database Validation (Drizzle)

Add constraints as a safety net:

```typescript
// db/schema.ts
export const myTable = pgTable(
  'my_table',
  { weight: numeric('weight', { precision: 5, scale: 2 }) },
  (table) => [
    check(
      'chk_weight_range',
      sql`${table.weight} >= 30 AND ${table.weight} <= 300`
    ),
  ]
);
```

## Naming Conventions

| Type          | Pattern             | Example                        |
| ------------- | ------------------- | ------------------------------ |
| Services      | `{Name}Service`     | `AuthService`                  |
| Repositories  | `{Name}Repository`  | `UserRepository`               |
| Domain Errors | `{Name}Error`       | `UserAlreadyExistsError`       |
| Schema Errors | `{Name}ErrorSchema` | `UserAlreadyExistsErrorSchema` |
| API Groups    | `{Name}ApiGroup`    | `AuthApiGroup`                 |
| Handlers      | `{Name}ApiLive`     | `AuthApiLive`                  |

## Error Handling

1. **Domain errors** with `Data.TaggedError`
2. **Schema errors** with `S.TaggedError` for HTTP responses
3. Map in handlers with `Effect.catchTags`

```typescript
yield *
  service
    .create(data)
    .pipe(
      Effect.catchTags({
        ValidationError: (e) =>
          Effect.fail(new ValidationErrorSchema({ message: e.message })),
      })
    );
```

## Testing

```bash
bun run test:integration:{feature}
```

Tests in `api/__tests__/` run against a real database.

## Reference Implementation

See `api/src/features/auth/` for a complete example.

---

# Web Development Guidelines

## Feature Structure

```
web/src/views/{feature}/
├── FeatureView.vue              # Main view component
├── actors/
│   └── feature.actor.ts         # XState machine + events
├── services/
│   └── feature.service.ts       # HTTP services (Effect)
├── composables/
│   └── useFeature.ts            # Vue composable for actor
├── components/                  # Feature-specific components
└── domain/
    └── domain.ts                # Business logic
```

## State Management

Use **XState** for complex state and **Effect** for HTTP services.

### Actor Pattern

```typescript
// actors/feature.actor.ts
enum State {
  Idle = 'Idle',
  Loading = 'Loading',
  Success = 'Success',
}
enum Event {
  SUBMIT = 'SUBMIT',
  ON_DONE = 'ON_DONE',
  ON_ERROR = 'ON_ERROR',
}
enum Emit {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export const featureActor = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    submitLogic: fromCallback(({ sendBack, input }) => {
      runWithUi(
        programSubmit(input),
        (result) => sendBack({ type: Event.ON_DONE, result }),
        (error) => sendBack({ type: Event.ON_ERROR, error })
      );
    }),
  },
}).createMachine({
  /* states */
});
```

### Composable Pattern

```typescript
// composables/useFeature.ts
export function useFeature() {
  const actorRef = useActorRef(featureActor);
  const idle = useSelector(actorRef, (s) => s.matches(State.Idle));
  const submit = (data) => actorRef.send({ type: Event.SUBMIT, data });
  return { idle, submit, actorRef };
}
```

## HTTP Services

Use Effect programs with `runWithUi` helper for XState integration.

```typescript
// services/feature.service.ts
export const programSubmit = (data: Data) =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient;
    const request = HttpClientRequest.post(`${API_BASE_URL}/endpoint`).pipe(
      HttpClientRequest.bodyJson(data)
    );
    const response = yield* httpClient.execute(request);
    return yield* handleResponse(response);
  }).pipe(Effect.provide(HttpClientLive));
```

## Components

- Use `<script setup lang="ts">` syntax
- PrimeVue components are globally registered
- Scoped SCSS with BEM naming

```vue
<template>
  <div class="feature">
    <div class="feature__header">...</div>
  </div>
</template>

<script setup lang="ts">
const { idle, submit } = useFeature();
</script>

<style scoped lang="scss">
.feature {
  &__header {
  }
}
</style>
```

## Naming Conventions

| Type        | Pattern                  | Example            |
| ----------- | ------------------------ | ------------------ |
| Views       | `{Name}View.vue`         | `CycleView.vue`    |
| Components  | `PascalCase.vue`         | `TimerCard.vue`    |
| Actors      | `{name}.actor.ts`        | `cycle.actor.ts`   |
| Services    | `{name}.service.ts`      | `cycle.service.ts` |
| Composables | `use{Name}.ts`           | `useCycle.ts`      |
| State enums | `State`, `Event`, `Emit` | Standard naming    |

## Authentication

- Global auth via `useAuth()` composable
- Routes with `meta: { requiresAuth: true }` are protected
- 401 responses trigger automatic logout

## Reference Implementation

See `web/src/views/signUp/` for a complete example with actor, service, and composable.
