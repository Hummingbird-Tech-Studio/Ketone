# Boundary Mapper — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers the five validation layers where mappers operate, branded types at boundaries, the asymmetric trust model, and common pitfalls.

---

## Where Mappers Fit in the Architecture

Boundary mappers are part of the **Functional Core, Imperative Shell** architecture. They operate at the edges where "dirty" external data enters or clean domain data exits.

```
┌─────────────────────────────────────────────────────┐
│                    BOUNDARY                          │
│  "Dirty" data → [VALIDATION/MAPPING] → "Clean" data │
│                                                      │
│    ┌───────────────────────────────────────┐        │
│    │       DETERMINISTIC CORE              │        │
│    │                                       │        │
│    │   Everything here satisfies           │        │
│    │   domain invariants.                  │        │
│    │   No defensive validation needed.     │        │
│    │                                       │        │
│    └───────────────────────────────────────┘        │
│                                                      │
│  Core data → [MAPPING/CONVERSION] → External DTOs   │
└─────────────────────────────────────────────────────┘
```

### The Five Validation Layers

| Layer                    | Location            | Direction         | Validates                    | Mapper Role                 |
| ------------------------ | ------------------- | ----------------- | ---------------------------- | --------------------------- |
| 1. Request Schema        | API handler         | External → Domain | Input format (string → Date) | Not typically a mapper      |
| 2. Domain Validation     | Domain service      | Internal          | Business rules (pure)        | Not a mapper                |
| 3. Service Coordination  | Application service | Internal          | Orchestration                | May call mappers            |
| 4. Repository            | Data access         | DB → Domain       | Output from database         | **Primary mapper location** |
| 5. Handler Error Mapping | API handler         | Domain → HTTP     | Error transformation         | Specialized mapper          |

**Boundary mappers are most commonly used at Layer 4** (database records → domain types) and at integration points with external APIs.

---

## Branded Types at System Boundaries

### Principle: Push Validation to the Edges

> **Push validation to the edges** — Validate and convert to domain types as early as possible (at the boundary), so the rest of the code works with safe types without needing conversions.

Branded types (like `UserId`) provide compile-time safety by distinguishing between semantically different values that share the same underlying type. A `UserId` and a `CycleId` are both UUIDs, but the type system prevents accidentally using one where the other is expected.

### The Boundary Decoding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BOUNDARIES (decode here)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Database → AuthService                                             │
│    user.id: string  →  S.decodeSync(UserId)  →  UserId             │
│                                                                     │
│  JWT Token → JwtService.verifyToken                                 │
│    result.userId: string  →  S.decodeSync(UserId)  →  UserId       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    REST OF THE SYSTEM (typed)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  JwtPayload.userId: UserId                                          │
│       ↓                                                             │
│  AuthenticatedUser.userId: UserId                                   │
│       ↓                                                             │
│  CycleService.createCycle(userId: UserId)      ← no decode needed   │
│       ↓                                                             │
│  DomainCycleService.prepareCreate({ userId })  ← no decode needed   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Correct: Decode at System Boundaries

```typescript
// Database returns user.id as string
const user = yield * userRepository.createUser(email, passwordHash);

// Decode at boundary: string → UserId
const userId = S.decodeSync(UserId)(user.id);

// Now we can use the typed value throughout the system
const token = yield * jwtService.generateToken(userId, user.email, user.createdAt);
```

```typescript
// JWT verification boundary
verifyToken: (token: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.tryPromise({ /* ... */ });

    // Decode at boundary: JWT payload userId (unknown) → UserId
    return yield* Effect.try({
      try: () =>
        new JwtPayload({
          userId: S.decodeSync(UserId)(result.userId as string),
          email: result.email as string,
        }),
      catch: (error) =>
        new JwtVerificationError({ message: 'Invalid JWT payload structure', cause: error }),
    });
  }),
```

### Anti-pattern: Using Type Assertions

**Never use `as` for branded types:**

```typescript
// ❌ BAD: Type assertion bypasses validation
const userId = user.id as UserId;

// ❌ BAD: No runtime validation, could be invalid UUID
const invalidUserId = 'not-a-uuid' as UserId; // Compiles but wrong!
```

**Always use `S.decodeSync` or `S.decode`:**

```typescript
// ✅ GOOD: Runtime validation + compile-time safety
const userId = S.decodeSync(UserId)(user.id);

// ✅ GOOD: Effect-based validation with error handling
const userId = yield * S.decode(UserId)(user.id);
```

---

## The Asymmetric Trust Model

Boundary mapping is fundamentally asymmetric:

| Direction         | Trust Level   | Validation                  | Can Fail?                   |
| ----------------- | ------------- | --------------------------- | --------------------------- |
| External → Domain | **Untrusted** | Full validation with Effect | Yes (`Effect.Effect<T, E>`) |
| Domain → External | **Trusted**   | No validation needed        | No (pure function)          |

### Why This Asymmetry Exists

- **External → Domain**: Data comes from outside your control (database, API, user input). It might be malformed, missing fields, or violate domain invariants.
- **Domain → External**: Data was constructed through your validated domain types. It already satisfies all invariants by construction.

```typescript
// External → Domain: May fail (validation)
export const fromInvoiceEntity = (entity: InvoiceEntity): Effect.Effect<LateFee, ParseResult.ParseError> =>
  S.decodeUnknown(LateFee)({
    id: entity.invoiceId,
    customerId: entity.customerId,
    amount: { value: entity.amount, currency: entity.currency },
    dueDate: new Date(entity.dueDate),
    status: 'Pending',
  });

// Domain → External: Always succeeds (pure)
export const toInvoiceEntity = (fee: LateFee): InvoiceEntity => ({
  invoiceId: fee.id,
  customerId: fee.customerId,
  amount: fee.amount.value,
  currency: fee.amount.currency,
  dueDate: fee.dueDate.toISOString(),
});
```

### Inside the Core: No Defensive Validation

Once data has crossed the boundary and been validated, the core trusts its inputs completely:

```typescript
// BOUNDARY: Transform external data to domain types
const order = yield * validateExternalOrder(rawPayload);

// CORE: Now we trust the types — no defensive checks needed
const total = calculateTotal(order); // order.items is guaranteed to be Item[]
const discount = applyDiscount(order, total); // order.customer has valid rating

// BOUNDARY: Transform back to external format
return toExternalResponse(discount);
```

---

## Repository Mappers: The Most Common Case

In practice, most boundary mappers live in repositories, converting between database records and domain types.

### Key Detail: `S.DateFromSelf` vs `S.DateFromString`

```typescript
// Database record schema — Drizzle returns Date objects, not strings
const CycleRecordSchema = S.Struct({
  id: S.UUID,
  userId: S.UUID,
  status: CycleStatusSchema,
  startDate: S.DateFromSelf, // ← DateFromSelf for DB Date objects
  endDate: S.DateFromSelf, // ← NOT DateFromString
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
});
```

**Why this matters:**

- `S.DateFromSelf` expects a JavaScript `Date` object (what Drizzle returns)
- `S.DateFromString` expects an ISO string (what HTTP APIs return)
- Using the wrong one causes silent validation failures

### Repository Pattern: Validate Output, Trust Input

```typescript
create: (userId: string, startDate: Date, endDate: Date) =>
  Effect.gen(function* () {
    const results = yield* drizzle
      .insert(cyclesTable)
      .values({ userId, startDate, endDate, status: 'InProgress' })
      .returning()
      .pipe(
        Effect.mapError((error) =>
          new CycleRepositoryError({ message: 'Failed to create cycle', cause: error }),
        ),
      );

    // Validate OUTPUT from database — the mapper
    return yield* S.decodeUnknown(CycleRecordSchema)(results[0]).pipe(
      Effect.mapError((error) =>
        new CycleRepositoryError({ message: 'Failed to validate record from DB', cause: error }),
      ),
    );
  }),
```

Key points:

- **Input** to the repository is trusted (comes from validated service layer)
- **Output** from the repository is validated (database could return unexpected data)

---

## Friction Points Are Acceptable

Not every conversion is seamless. When the external world doesn't match your model, **make the friction explicit**:

```typescript
const fromCustomerEntity = (entity: CustomerEntity): Effect.Effect<EnrichedCustomer, InvalidCustomerDataError> =>
  Effect.gen(function* () {
    // Explicit validation at the boundary
    if (entity.rating == null) {
      return yield* Effect.fail(new InvalidCustomerDataError({ field: 'rating', message: 'Rating is required' }));
    }
    if (!SUPPORTED_CURRENCIES.includes(entity.preferredCurrency)) {
      return yield* Effect.fail(
        new InvalidCustomerDataError({
          field: 'currency',
          message: `Unsupported currency: ${entity.preferredCurrency}`,
        }),
      );
    }

    // Once validated, construct the rich type
    // Note: `as SupportedCurrency` is acceptable here because we already validated
    // the value above with SUPPORTED_CURRENCIES.includes(). This is a literal union
    // type narrowing, NOT a branded type bypass. For branded types, always use
    // S.decodeSync/S.decode instead.
    return new EnrichedCustomer({
      id: CustomerId(entity.id),
      rating: CustomerRating(entity.rating),
      currency: entity.preferredCurrency as SupportedCurrency,
    });
  });
```

### Principle

> Handle errors and throw exceptions **at the boundary**, but keep the core clean of defensive concerns.

The core should be a paradise of well-typed, trusted data. All the messiness of the real world stays at the edges.

---

## Handler Error Mapping: A Special Kind of Mapper

Handlers map domain errors to HTTP error schemas. This is also a boundary mapping, but for the error channel:

```typescript
const cycle =
  yield *
  cycleService.createCycle(currentUser.userId, payload.startDate, payload.endDate).pipe(
    Effect.catchTags({
      InvalidDateRangeError: (e) => Effect.fail(new InvalidDateRangeErrorSchema({ message: e.message })),
      FutureStartDateError: (e) => Effect.fail(new FutureStartDateErrorSchema({ message: e.message })),
      ActiveCycleExistsError: (e) => Effect.fail(new ActiveCycleExistsErrorSchema({ message: e.message })),
      CycleOverlapError: (e) => Effect.fail(new CycleOverlapErrorSchema({ message: e.message })),
      CycleRepositoryError: () => Effect.fail(new CycleRepositoryErrorSchema({ message: 'Database operation failed' })),
    }),
  );
```

Note the asymmetry:

- **Domain errors** (`Data.TaggedError`) have rich data (startDate, endDate, etc.)
- **HTTP errors** (`S.TaggedError`) expose only safe data (message string)
- The mapper strips internal details at the boundary

---

## Roundtrip Testing

Always test that `domain → external → domain` preserves data:

```typescript
describe('roundtrip', () => {
  it('domain → DTO → domain preserves data', async () => {
    const original = new LateFee({
      id: '550e8400-e29b-41d4-a716-446655440000' as LateFeeId,
      customerId: '550e8400-e29b-41d4-a716-446655440001' as CustomerId,
      amount: new Money({ value: 100, currency: 'USD' }),
      dueDate: new Date('2025-01-15'),
      status: 'Pending',
    });

    const dto = toInvoiceEntity(original);
    const restored = await Effect.runPromise(fromInvoiceEntity(dto));

    expect(restored.id).toEqual(original.id);
    expect(restored.amount.value).toEqual(original.amount.value);
  });
});
```

This catches:

- Date serialization issues (timezone problems)
- Field name mismatches
- Type conversion bugs
- Missing fields in the mapping

---

## Checklist for Boundary Mappers

### Correctness

- [ ] External → Domain uses Effect (can fail)
- [ ] Domain → External is a pure function (always succeeds)
- [ ] Branded types are decoded with `S.decodeSync`/`S.decode`, never `as`
- [ ] Database schemas use `S.DateFromSelf` (not `S.DateFromString`)
- [ ] Roundtrip test exists (domain → external → domain)

### Boundary Hygiene

- [ ] External data validated at the boundary
- [ ] External entities treated as DTOs (no domain behavior)
- [ ] Mapping code is isolated (`toEntity()` / `fromEntity()` functions)
- [ ] Core trusts its inputs (no defensive validation inside)
- [ ] Friction points are explicit (domain errors for invalid external data)
