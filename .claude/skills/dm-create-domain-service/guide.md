# Domain Service — Extended Guide

For the template and usage syntax, see [SKILL.md](SKILL.md).

This guide covers the philosophical foundation of determinism, how services create architectural seams, the cohesion principle with the Orphan Test, and how shell services coordinate core services.

---

## Determinism: The Core Principle

> "Separate how you obtain data from what you do with it."

This simple heuristic is the foundation of every domain service. It transforms non-deterministic methods into deterministic functions, dramatically improving testability and reasoning.

### The Distinction

```typescript
// ❌ Non-deterministic: depends on the outside world
const figureOutDueDate = (invoice: Invoice) =>
  Effect.gen(function* () {
    const today = yield* DateTime.nowAsDate; // external dependency
    const terms = yield* ContractsService.getTerms(invoice.customerId); // service call
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

### Functions Have Finite Size

When types are well-defined, the number of possible implementations is finite:

```typescript
type People = 'Bob' | 'Mary';
type Jobs = 'Chef' | 'Engineer';

// Only 4 possible implementations exist!
const assignJob = (job: Jobs): People =>
  Match.value(job).pipe(
    Match.when('Chef', () => '???'), // Bob or Mary
    Match.when('Engineer', () => '???'), // Bob or Mary
    Match.exhaustive,
  );
```

**Implication**: Well-typed functions guide their own implementation. When the types are precise enough, the code almost writes itself.

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

This maps directly to how domain services are structured:

- **Shell methods** yield `Clock`, call repositories, perform I/O
- **Core methods** are pure functions that receive all data as parameters
- The shell collects data and feeds it to the core

---

## How Shell Services Coordinate Core Services

In the full architecture, there are two levels of services:

### Domain Service (Functional Core)

Pure business logic, no I/O. Lives in the domain package.

```typescript
// packages/cycle-domain/src/cycle/services/cycle.validation.service.ts
export class CycleValidationService extends Effect.Service<CycleValidationService>()('CycleValidationService', {
  effect: Effect.gen(function* () {
    return {
      validateNewCycle: (startDate: Date, endDate: Date, lastCompletedEndDate: Date | null) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          // Pure validation: no database, no HTTP
          if (startDate.getTime() > now.getTime() + START_DATE_TOLERANCE_MS) {
            return yield* Effect.fail(new FutureStartDateError({ ... }));
          }
          return yield* createDateRange(startDate, endDate);
        }),
    };
  }),
}) {}
```

### Application Service (Imperative Shell)

Coordinates domain services with repositories. Lives in the API package.

```typescript
// packages/api/src/features/cycle/services/cycle.service.ts
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const repository = yield* CycleRepository;
    const validationService = yield* CycleValidationService;

    return {
      createCycle: (userId: string, startDate: Date, endDate: Date) =>
        Effect.gen(function* () {
          // 1. I/O: Check for active cycle
          const activeCycle = yield* repository.findActiveByUserId(userId);
          if (activeCycle) {
            return yield* Effect.fail(new ActiveCycleExistsError({ ... }));
          }

          // 2. I/O: Get data for validation
          const lastCompleted = yield* repository.findLastCompletedByUserId(userId);

          // 3. CORE: Validate using domain service
          yield* validationService.validateNewCycle(startDate, endDate, lastCompleted?.endDate ?? null);

          // 4. I/O: Persist
          return yield* repository.create(userId, startDate, endDate);
        }),
    };
  }),
  dependencies: [CycleRepository.Default, CycleValidationService.Default],
}) {}
```

Key points:

- The application service **coordinates** validation and persistence
- It does NOT contain validation logic itself
- It returns typed union of possible errors
- Domain service stays pure and testable

---

## Data Creates Architectural Seams

Well-defined data types in services create natural interfaces for reorganizing your system. The boundaries between types become boundaries between components.

### From Monolith to Components

```
Before: Everything in a for-loop
┌─────────────────────────────────┐
│ for each customer:              │
│   load → process → bill → save  │
└─────────────────────────────────┘

After: Independent components connected by data
┌──────────┐    ┌─────────┐    ┌──────────┐
│  Loader  │───▶│  Core   │───▶│  Biller  │
│ (async)  │    │ (pure)  │    │ (queue)  │
└──────────┘    └─────────┘    └──────────┘
     │               │
     │               ▼
     │        ┌──────────────┐
     └───────▶│  Approvals   │
              │ (microserv.) │
              └──────────────┘
```

### How Service Types Enable This

When your service's data is well-typed, each transformation becomes a clear interface:

```typescript
// These types define the seams
type LoadedData = { customer: Customer; invoices: Invoice[]; today: Date };
type ProcessedResult = { pastDue: PastDueInvoice[]; decisions: BillingDecision[] };
type BillingOutput = { fees: LateFee[]; notifications: Notification[] };

// Each component is independent and testable
const loader = (): Effect<LoadedData, LoaderError> => {
  /* ... */
};
const processor = (data: LoadedData): ProcessedResult => {
  /* pure */
};
const biller = (result: ProcessedResult): Effect<BillingOutput, BillerError> => {
  /* ... */
};
```

### Real-World Example

The `assessProgress` function demonstrates this:

```typescript
// Input type: Cycle + Date
// Output type: CycleProgressAssessment (OnTrack | Overdue | Completed)
export const assessProgress = (cycle: Cycle, now: Date): CycleProgressAssessment => ...

// This function is a "seam" - it could be:
// - Called directly in-process
// - Exposed as an API endpoint
// - Run as a serverless function
// - Processed in a queue worker
// The types define the contract, the deployment is flexible
```

| Benefit                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| **Independent deployment** | Components can be deployed separately                |
| **Parallel development**   | Teams work on different components without conflicts |
| **Testing isolation**      | Test each component with simple input/output         |
| **Technology flexibility** | Each component can use different tech (queues, DBs)  |
| **Scaling options**        | Scale components independently based on load         |

---

## Cohesion Principle

> **Things that change together, live together.**

### Why Cohesion Matters

| Low Cohesion (Scattered)                                            | High Cohesion (Grouped)              |
| ------------------------------------------------------------------- | ------------------------------------ |
| Validation in `validation/`, errors in `errors/`, types in `types/` | Everything cycle-related in `cycle/` |
| Change requires editing multiple folders                            | Change is localized to one folder    |
| Hard to understand what belongs to "cycle"                          | Clear boundary of the cycle module   |
| Risk of orphaned code when refactoring                              | Module is self-contained             |

### Guidelines

1. **Validation services live with their domain module**

   ```
   ❌ Scattered:
   src/
   ├── validation/
   │   └── cycle.validation.service.ts
   └── cycle/
       └── cycle.service.ts

   ✅ Cohesive:
   src/
   └── cycle/
       ├── cycle.service.ts
       └── cycle.validation.service.ts
   ```

2. **Domain errors live with their domain module** — Cycle errors in `cycle/errors.ts`, not in a generic `errors/` folder.

3. **Reusable value objects go to `shared/`** — If used by 2+ modules.

### The Orphan Test

> "If I delete this module, what becomes orphaned?"

Everything that would become orphaned belongs inside the module.

- **`CycleId`**: "If I delete `cycle/`, does `CycleId` still make sense?" → No → Lives in `cycle/cycle.model.ts`
- **`UserId`**: "If I delete `cycle/`, does `UserId` still make sense?" → Yes → Lives in `shared/ids.ts`
- **`CycleValidationService`**: Only validates cycles → Lives in `cycle/`
- **`Duration`, `Percentage`**: Generic quantities → Lives in `shared/`

### When to Extract to `shared/`

| Keep in module                          | Extract to `shared/`            |
| --------------------------------------- | ------------------------------- |
| Used only by this module                | Used by 2+ modules              |
| Semantically tied to the domain concept | Generic/reusable across domains |
| Would be orphaned if module is deleted  | Has independent meaning         |

---

## Type Classification for Services

Understanding what type of component you're building helps decide where it lives:

| Category             | Description                               | Effect Construct         | Example                        |
| -------------------- | ----------------------------------------- | ------------------------ | ------------------------------ |
| **Entity**           | Has identity, persists over time          | `S.Class` with `id`      | `Cycle`                        |
| **Value Object**     | Immutable, no identity, equality by value | `S.Class` or `interface` | `DateRange`, `StageThresholds` |
| **Enum**             | Finite set of values                      | `S.Literal` + const      | `CycleStatus`, `FastingStage`  |
| **ADT**              | Discriminated union with variant data     | `Data.TaggedEnum`        | `CycleProgressAssessment`      |
| **Domain Error**     | Typed errors for domain violations        | `Data.TaggedError`       | `CycleNotInProgressError`      |
| **Domain Service**   | Stateless logic operating on domain types | `Effect.Service`         | `CycleService`                 |
| **Operation Input**  | Data required to execute a use case       | `contracts/`             | `CreateCycleInput`             |
| **Operation Output** | Decision/result from a use case           | `contracts/`             | `CycleUpdateDecision`          |

---

## Effect.Service Pattern (Recommended)

When creating a domain service, use these standard settings:

```typescript
export class CycleService extends Effect.Service<CycleService>()('CycleService', {
  effect: Effect.gen(function* () {
    const validationService = yield* CycleValidationService;

    return {
      /* methods — use `yield* DateTime.nowAsDate` inside methods that need current time */
    } satisfies ICycleService;
  }),
  dependencies: [CycleValidationService.Default],
  accessors: true,
}) {}
```

### Configuration

| Setting        | Value                              | Why                                                         |
| -------------- | ---------------------------------- | ----------------------------------------------------------- |
| `accessors`    | `true`                             | Enables `Service.method()` syntax without yielding first    |
| `dependencies` | `[Dep.Default, ...]`               | Declares service dependencies for automatic DI resolution   |
| `effect`       | `Effect.gen(function* () { ... })` | Generator body that yields dependencies and returns methods |

### `accessors: true` Enables Direct Calls

```typescript
// Without accessors — must yield the service first
const result =
  yield *
  Effect.gen(function* () {
    const service = yield* CycleService;
    return service.elapsedMs(cycle);
  });

// With accessors — call directly
const result = yield * CycleService.elapsedMs(cycle);

// Pure methods work without yield
const canComplete = CycleService.canComplete(cycle);
```

### Method Classification

Keep methods pure unless they explicitly need shell capabilities:

```typescript
return {
  // Pure: no dependencies, synchronous — can be called without Effect
  canComplete: (cycle: Cycle): boolean => cycle.status === 'InProgress',

  // Effectful: depends on DateTime — must be yielded
  elapsedMs: (cycle: Cycle) =>
    Effect.gen(function* () {
      const now = yield* DateTime.nowAsDate;
      return Duration(Math.max(0, now.getTime() - cycle.startDate.getTime()));
    }),
} satisfies ICycleService;
```

---

## Separate Data from Behavior

Keep entities as pure data structures. Put behavior in services:

```typescript
// Entity (data only)
class Cycle extends S.Class<Cycle>('Cycle')({
  id: CycleId,
  startDate: S.DateFromSelf,
  endDate: S.DateFromSelf,
  status: CycleStatusSchema,
}) {}

// Derived values live in the service (pure functions)
const elapsedHours = (cycle: Cycle, now: Date): ElapsedHours => ...
const canComplete = (cycle: Cycle): boolean => ...
const getCurrentStage = (cycle: Cycle, now: Date): FastingStage => ...
```

This separation means:

- The entity is a simple, serializable data structure
- Business logic is testable independently
- The same entity can be used with different behavior in different contexts
