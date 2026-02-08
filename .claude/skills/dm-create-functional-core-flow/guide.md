# Functional Core Flow — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide provides the architectural foundation, validation layer model, and philosophical principles behind the Three Phases pattern.

---

## The Architecture: Functional Core, Imperative Shell

The Three Phases pattern is a concrete application of the **Functional Core, Imperative Shell** architecture:

- **Functional Core**: Pure business logic with no side effects. Includes domain services, value objects, policies, and invariants.
- **Imperative Shell**: Code that handles I/O, external systems, and orchestration. Wraps the functional core.

### Why This Architecture Exists

1. **Testability**: Pure domain logic can be unit tested without mocks or infrastructure
2. **Separation of Concerns**: Business rules live in one place, I/O in another
3. **Clean Data Flow**: Data is validated and transformed at system boundaries
4. **Type Safety**: Effect Schema provides compile-time and runtime guarantees

### Full Request Flow

```
HTTP Request (JSON)
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  IMPERATIVE SHELL: Request Schema                       │
│  - Parses JSON to typed objects                         │
│  - Validates input format (DateFromString → Date)       │
│  - Framework validates automatically before handler     │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  IMPERATIVE SHELL: Handler                              │
│  - Orchestrates the flow                                │
│  - Maps domain errors to HTTP errors                    │
│  - Serializes response                                  │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  IMPERATIVE SHELL: Application Service                  │
│  - Orchestrates validation + repository                 │
│  - Applies business rules with I/O                      │
│  - Returns typed domain errors                          │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  FUNCTIONAL CORE: Domain Validation                     │
│  - Pure business rules                                  │
│  - No I/O or side effects                               │
│  - Testable in isolation                                │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  IMPERATIVE SHELL: Repository                           │
│  - Database access                                      │
│  - Validates output from DB (CycleRecordSchema)         │
│  - Guarantees data integrity at boundary                │
└─────────────────────────────────────────────────────────┘
       │
       ▼
HTTP Response (JSON)
```

---

## The Five Validation Layers

Each layer has a specific role. Understanding all five is critical for correctly placing logic.

### Layer 1: Input Validation (Shell — Request Schema)

Request schemas validate and transform incoming JSON **before reaching handlers**.

```typescript
export class CreateCycleRequestSchema extends S.Class<CreateCycleRequestSchema>('CreateCycleRequestSchema')({
  startDate: S.DateFromString, // Transforms ISO string → Date
  endDate: S.DateFromString,
}) {}
```

- The framework validates automatically before the handler executes
- **If the request schema fails, the handler never runs** — invalid requests return 400 immediately
- Transformation happens here (string → Date, etc.)

### Layer 2: Domain Validation (Core — Pure Business Rules)

Business rules live in pure domain services with no I/O.

```typescript
export class CycleValidationService extends Effect.Service<CycleValidationService>()('CycleValidationService', {
  effect: Effect.gen(function* () {
    return {
      validateNewCycle: (startDate: Date, endDate: Date, lastCompletedEndDate: Date | null) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;

          if (startDate.getTime() > now.getTime() + START_DATE_TOLERANCE_MS) {
            return yield* Effect.fail(new FutureStartDateError({ message: '...', startDate, currentTime: now }));
          }

          if (lastCompletedEndDate && startDate.getTime() < lastCompletedEndDate.getTime()) {
            return yield* Effect.fail(
              new CycleOverlapError({
                message: '...',
                newStartDate: startDate,
                existingCycleEndDate: lastCompletedEndDate,
              }),
            );
          }

          return yield* createDateRange(startDate, endDate).pipe(
            Effect.mapError(
              (parseError) =>
                new InvalidDateRangeError({
                  message: `Invalid date range: ${ParseResult.TreeFormatter.formatErrorSync(parseError)}`,
                  startDate,
                  endDate,
                }),
            ),
          );
        }),
    };
  }),
}) {}
```

Key points:

- Uses `Clock` dependency for time (testable with `TestClock`)
- Returns domain-specific `TaggedError` types
- No database or HTTP knowledge
- Pure functions operating on clean data

### Layer 3: Service Coordination (Shell — Application Service)

Services coordinate between domain validation and repositories.

```typescript
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const validationService = yield* CycleValidationService;

    return {
      createCycle: (userId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          // 1. Business rule check (requires I/O)
          const activeCycle = yield* repository.findActiveByUserId(userId);
          if (activeCycle) {
            return yield* Effect.fail(
              new ActiveCycleExistsError({ message: '...', userId, activeCycleId: activeCycle.id }),
            );
          }

          // 2. Get data for validation
          const lastCompleted = yield* repository.findLastCompletedByUserId(userId);

          // 3. Validate using domain service (pure core)
          yield* validationService.validateNewCycle(startDate, endDate, lastCompleted?.endDate ?? null);

          // 4. Persist
          return yield* repository.create(userId, startDate, endDate);
        }),
    };
  }),
  dependencies: [CycleRepository.Default, CycleValidationService.Default],
}) {}
```

Key points:

- Coordinates validation and persistence
- Does NOT contain validation logic itself
- Returns typed union of possible errors

### Layer 4: Repository Validation (Shell — Output Validation)

Repositories validate **output** from the database, not input.

```typescript
create: (userId: string, startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const results = yield* drizzle
      .insert(cyclesTable)
      .values({ userId, startDate, endDate, status: 'InProgress' })
      .returning()
      .pipe(Effect.mapError((error) => new CycleRepositoryError({ message: 'Failed to create cycle', cause: error })));

    // Validate OUTPUT from database
    return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
      Effect.mapError((error) => new CycleRepositoryError({ message: 'Failed to validate record from DB', cause: error })),
    );
  }),
```

Repository Output Schema:

```typescript
export const CycleRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf, // DateFromSelf for DB Date objects
  endDate: S.DateFromSelf,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});
```

Key points:

- Input is trusted (comes from validated service layer)
- Output is validated (database could return unexpected data)
- Uses `S.DateFromSelf` because Drizzle returns `Date` objects, not strings

### Layer 5: Handler Error Mapping (Shell — HTTP Errors)

Handlers map domain errors to HTTP error schemas.

```typescript
export const CycleApiLive = HttpApiBuilder.group(Api, 'cycle', (handlers) =>
  Effect.gen(function* () {
    const cycleService = yield* CycleService;

    return handlers.handle('createCycle', ({ payload }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const cycle = yield* cycleService.createCycle(currentUser.userId, payload.startDate, payload.endDate).pipe(
          Effect.catchTags({
            InvalidDateRangeError: (e) => Effect.fail(new InvalidDateRangeErrorSchema({ message: e.message })),
            FutureStartDateError: (e) => Effect.fail(new FutureStartDateErrorSchema({ message: e.message })),
            ActiveCycleExistsError: (e) => Effect.fail(new ActiveCycleExistsErrorSchema({ message: e.message })),
            CycleOverlapError: (e) => Effect.fail(new CycleOverlapErrorSchema({ message: e.message })),
            CycleRepositoryError: () =>
              Effect.fail(new CycleRepositoryErrorSchema({ message: 'Database operation failed' })),
          }),
        );
        return toCycleResponse(cycle);
      }),
    );
  }),
);
```

Key points:

- Domain errors (`Data.TaggedError`) map to HTTP errors (`S.TaggedError`)
- Handler focuses on orchestration, not validation
- Response transformation happens in the handler (Date → ISO string)

---

## Domain Errors vs HTTP Errors

### Domain Errors (Functional Core)

Defined with `Data.TaggedError` for rich error data:

```typescript
export class InvalidDateRangeError extends Data.TaggedError('InvalidDateRangeError')<{
  readonly message: string;
  readonly startDate: Date;
  readonly endDate: Date;
}> {}
```

### HTTP Errors (Imperative Shell)

Defined with `Schema.TaggedError` for serialization:

```typescript
export class InvalidDateRangeErrorSchema extends S.TaggedError<InvalidDateRangeErrorSchema>()(
  'InvalidDateRangeErrorSchema',
  { message: S.String },
) {}
```

---

## Determinism: The Core Principle

> "Separate how you obtain data from what you do with it."

This heuristic transforms non-deterministic methods into deterministic functions.

```typescript
// ❌ Non-deterministic: depends on the outside world
const figureOutDueDate = (invoice: Invoice) =>
  Effect.gen(function* () {
    const today = yield* DateTime.nowAsDate;
    const terms = yield* ContractsService.getTerms(invoice.customerId);
    return addDays(today, terms.days);
  });

// ✅ Deterministic: everything comes as parameters
const figureOutDueDate = (today: Date, terms: PaymentTerms): Date =>
  Match.value(terms).pipe(
    Match.when('NET_30', () => addDays(today, 30)),
    Match.when('NET_60', () => addDays(today, 60)),
    Match.when('END_OF_MONTH', () => lastDayOfMonth(today)),
    Match.exhaustive,
  );
```

| Aspect          | Non-Deterministic                    | Deterministic                  |
| --------------- | ------------------------------------ | ------------------------------ |
| **Testing**     | Requires mocks, stubs, complex setup | Direct input → output          |
| **Reasoning**   | Need to know global state            | Everything is in the signature |
| **Maintenance** | Fragile to changes                   | Isolated and predictable       |
| **Debugging**   | Hard to reproduce issues             | Same inputs = same outputs     |

### Architecture: Deterministic Core + Non-Deterministic Shell

```
┌─────────────────────────────────────────┐
│       Non-Deterministic Shell           │
│  (services, DB, current date, I/O)      │
│                                         │
│    ┌───────────────────────────────┐    │
│    │     Deterministic Core        │    │
│    │   (pure business logic)       │    │
│    │                               │    │
│    │  - Only depends on other      │    │
│    │    deterministic components   │    │
│    │  - Dependency arrows only     │    │
│    │    point inward               │    │
│    └───────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

---

## Referential Transparency

A deterministic function can be thought of as a lookup table mapping inputs to outputs.

```typescript
// This function...
const increment = (x: number): number => x + 1;

// ...is conceptually equivalent to a map:
// { 0 → 1, 1 → 2, 2 → 3, ... }
```

### Practical Implications

**1. Testing becomes trivial** — just verify the lookup table:

```typescript
describe('calculateDiscount', () => {
  it.each([
    [100, 'Gold', 15],
    [100, 'Silver', 10],
    [100, 'Bronze', 5],
  ])('amount=%d, tier=%s => discount=%d', (amount, tier, expected) => {
    expect(calculateDiscount(amount, tier)).toBe(expected);
  });
});
```

**2. Debugging becomes reproducible** — log the inputs, reproduce the output:

```typescript
const result = assessProgress(cycle, now);
// Anyone can reproduce this exact result with these inputs
```

**3. Caching is always safe** — same input always gives same output.

### Relationship to Effect

Effect uses this principle: pure computations are **descriptions** of what to do, not the execution itself. The key insight: **pure functions describe transformations, Effect describes computations with potential side effects**. Keep your business logic in pure functions, and use Effect only at the boundaries.

---

## Authentication Boundary

Authentication supplies `CurrentUser` and validates the `userId` (UUID) before handlers run. This keeps identity validation in the shell and out of the core domain.

```typescript
export class AuthenticatedUser extends S.Class<AuthenticatedUser>('AuthenticatedUser')({
  userId: UserId, // Branded type, not raw S.UUID
  email: S.String,
}) {}
```

---

## Testing Benefits by Layer

| Layer               | Test Type   | Dependencies                      |
| ------------------- | ----------- | --------------------------------- |
| Domain Validation   | Unit        | `TestClock` only                  |
| Application Service | Integration | Mock repository + real validation |
| Repository          | Integration | Test database                     |
| Handler             | E2E         | Full stack                        |

Domain validation tests are fast and isolated:

```typescript
it('should fail for future start date', () =>
  Effect.gen(function* () {
    const futureDate = new Date(Date.now() + 86400000);
    const result = yield* validationService.validateStartDateNotFuture(futureDate).pipe(Effect.flip);
    expect(result._tag).toBe('FutureStartDateError');
  }).pipe(Effect.provide(TestClock.layer(Date.now())), Effect.runPromise));
```

---

## Checklist for New Implementations

When implementing a new feature using the Three Phases pattern, verify:

- [ ] **Request Schema** validates and transforms input (strings → typed values)
- [ ] **Domain Validation Service** contains pure business rules
- [ ] **Application Service** coordinates validation and repository, returns typed errors
- [ ] **Repository** validates output from database, trusts input
- [ ] **Handler** maps domain errors to HTTP errors with `catchTags`
- [ ] **Handler** serializes responses (Date → string, etc.)
- [ ] **Response Schema** defines the response shape

---

## File Structure Reference

```
packages/api/src/features/{feature}/
├── api/
│   ├── {feature}-api.ts           # Endpoint definitions
│   ├── {feature}-api-handler.ts   # Handler + error mapping
│   └── schemas/
│       ├── requests.ts            # Input validation (Layer 1)
│       ├── responses.ts           # Response shape
│       └── errors.ts              # HTTP error schemas (Layer 5)
├── services/
│   └── {feature}.service.ts       # Orchestration layer (Layer 3)
└── repositories/
    ├── {feature}.repository.ts    # DB access + output validation (Layer 4)
    └── schemas.ts                 # DB record schemas

packages/{feature}-domain/
└── src/
    ├── shared/
    │   └── date-range.ts          # Reusable value objects
    └── {feature}/
        ├── {feature}.ts           # Entity + types
        ├── {feature}.service.ts   # Core domain service
        ├── {feature}.validation.service.ts  # Validation (Layer 2)
        └── errors.ts              # All domain errors
```
