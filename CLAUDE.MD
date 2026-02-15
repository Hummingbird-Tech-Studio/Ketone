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

## Import Rules (Circular Dependency Prevention)

Feature barrels (`features/{feature}/index.ts`) must NOT re-export `./api`.
Handlers are leaf nodes — only `api.ts` imports them.

Cross-feature imports must target a specific sublayer:
- `../../plan/domain` — types, contracts, errors
- `../../plan/repositories` — data access
- `../../plan/services` — application services

Never: `../../plan` (feature barrel).

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

## Logging

Use `Effect.annotateLogs` to add structured metadata to logs. **Do not use manual prefixes** like `[ServiceName]`.

### Pattern

Add `.pipe(Effect.annotateLogs({ key: 'value' }))` at the end of each method:

```typescript
// Services
signup: (email: string, password: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Starting signup process');
    // ...
  }).pipe(Effect.annotateLogs({ service: 'AuthService' })),

// Repositories
createUser: (email: string, passwordHash: string) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Creating user');
    // ...
  }).pipe(Effect.annotateLogs({ repository: 'UserRepository' })),

// Handlers
handlers.handle('signup', ({ payload }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('POST /auth/signup - Request received');
    // ...
  }).pipe(Effect.annotateLogs({ handler: 'auth.signup' })),
),

// Utilities
export const getClientIp = (request) =>
  Effect.gen(function* () {
    // ...
  }).pipe(Effect.annotateLogs({ util: 'getClientIp' }));
```

### Annotation Keys

| Component    | Key          | Example Value      |
| ------------ | ------------ | ------------------ |
| Services     | `service`    | `'AuthService'`    |
| Repositories | `repository` | `'UserRepository'` |
| Handlers     | `handler`    | `'auth.signup'`    |
| Utilities    | `util`       | `'getClientIp'`    |

### Output Format

```
timestamp=2025-01-01T00:00:00.000Z level=INFO message="Creating user" repository=UserRepository
```

## Testing

```bash
bun run test:integration:{feature}
```

Tests in `api/__tests__/` run against a real database.

## Database Migrations

### Workflow

#### Standard Schema Changes

1. Modify the schema in `api/src/db/schema.ts`
2. Generate migration: `bun run db:generate`
3. Apply migration: `bun run db:migrate`

### Rules

- **Always use `db:migrate`** to apply schema changes (tracks migrations)
- **Never use `db:push`** in production (applies changes without tracking)
- **Never run SQL directly** in Neon to modify schema

### Troubleshooting: Migration Tracking Out of Sync

If migrations fail with errors like `type "X" already exists` or `relation "X" already exists`, the migration tracking table may be out of sync with the actual database state.

**Diagnosis:**

```sql
-- Check migration tracking table (run in Neon SQL Editor)
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id;

-- Check existing tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Check existing enums
SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;
```

**Fix:** Insert missing migration records into the tracking table:

```sql
-- Example: Insert records for migrations that were already applied
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES
(0, '0000_migration_name', 1762526479121),
(1, '0001_migration_name', 1762526480000);
-- Add more as needed based on api/drizzle/meta/_journal.json

-- Fix the sequence after manual inserts
SELECT setval(
  pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id'),
  (SELECT MAX(id) FROM drizzle.__drizzle_migrations) + 1
);
```

Migration names and timestamps can be found in `api/drizzle/meta/_journal.json`.

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

## Critical: HTTP Request Pattern

**ALL HTTP requests in Vue components MUST be handled through XState actors.** Never call Effect programs directly in components.

### Anti-Pattern (FORBIDDEN)

```typescript
// ❌ NEVER do this in a Vue component
import { runWithUi } from '@/utils/effects/helpers';
import { programGetData } from './services/feature.service';

onMounted(() => {
  runWithUi(
    programGetData(),
    (result) => { data.value = result; },
    (error) => { /* handle error */ }
  );
});
```

### Correct Pattern (REQUIRED)

```typescript
// ✅ Always use XState actors for HTTP requests

// 1. In actor: actors/feature.actor.ts
const loadDataLogic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programGetData(),
    (result) => sendBack({ type: Event.ON_SUCCESS, result }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

// 2. In composable: composables/useFeature.ts
const { send, actorRef } = useActor(featureMachine, { input: { /* ... */ } });
const data = useSelector(actorRef, (state) => state.context.data);
const loadData = () => send({ type: Event.LOAD_DATA });

// 3. In component: FeatureView.vue
const { data, loadData } = useFeature();
onMounted(() => loadData());
```

### Why This Matters

1. **Consistent error handling**: Actors emit errors that are handled uniformly via `usePlanEmissions` or similar
2. **Testability**: State machines are easier to test than ad-hoc async code
3. **State visibility**: All async state (loading, error) is tracked in the machine context
4. **Predictability**: State transitions are explicit and debuggable

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
