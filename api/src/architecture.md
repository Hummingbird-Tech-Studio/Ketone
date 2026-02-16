# API FC/IS Architecture

> Cross-cutting architecture overview for the Ketone API package.
> Feature-specific designs live in each feature's `domain/functional-domain-design.md`.
> Reference implementations: `api/src/features/plan/` and `api/src/features/plan-template/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Layer (Functional Core + Boundary Artifacts)](#2-domain-layer-functional-core--boundary-artifacts)
3. [Shell Layers Breakdown](#3-shell-layers-breakdown)
4. [Complete Data Flow Diagrams](#4-complete-data-flow-diagrams)
5. [Responsibility Matrix](#5-responsibility-matrix)
6. [API - Web Analogy Table](#6-api--web-analogy-table)
7. [The FC Delegation Rule](#7-the-fc-delegation-rule)
8. [Key Architectural Rules](#8-key-architectural-rules)
9. [Directory Structure Reference](#9-directory-structure-reference)
10. [Architecture Phases (dm-design Alignment)](#10-architecture-phases-dm-design-alignment)
11. [Decision Flowchart: Where Does This Logic Go?](#11-decision-flowchart-where-does-this-logic-go)
12. [Glossary](#12-glossary)
13. [FC/IS Compliance Checklist](#13-fcis-compliance-checklist)

---

## 1. Architecture Overview

### One Shell Wrapping the Core

Unlike the web (two shell families flanking the core), the API has **one shell** wrapping a
central Functional Core. The shell layers handle HTTP requests on one side and database
persistence on the other, with the Core making all business decisions in between.

```
  HTTP REQUEST                                                    DATABASE

+-------------------------+                                +-------------------------+
|       Handler           |                                |      Repository         |
|  (plan-api-handler.ts)  |                                | (plan.repository.ts)    |
+-----------+-------------+                                +------------+------------+
            |                                                           ^
            v                                                           |
+-------------------------+                                             |
|    Application Service  |---------------------------------------------+
|   (Three Phases)        |
+-----------+-------------+
            |
            v
     +============+
     ||          ||
     ||    FC    ||
     ||          ||
     +============+
```

### Why This Architecture

| Benefit          | How                                                                              |
| ---------------- | -------------------------------------------------------------------------------- |
| **Testability**  | Pure FC functions are trivially testable — no mocks, no DB, no HTTP              |
| **Clarity**      | Each layer has one job — easy to locate and modify code                          |
| **Error typing** | Domain errors flow through typed channels — `Data.TaggedError` → `S.TaggedError` |
| **DI**           | Effect.Service provides compile-time dependency management                       |

### Layer Responsibilities Summary

| Layer               | Classification    | Responsibility                                    |
| ------------------- | ----------------- | ------------------------------------------------- |
| Handler             | **Shell (HTTP)**  | Extract user, validate request, map errors, log   |
| Application Service | **Shell (Coord)** | Three Phases: Collection → Logic → Persistence    |
| Repository          | **Shell (DB)**    | Database access, output validation, boundary maps |
| Domain Service      | **Core**          | Pure decision functions, no I/O                   |
| Model               | **Core**          | Branded types, VOs, entities, domain-state ADTs   |
| Contract            | **Boundary**      | Use-case Input + Decision ADT                     |
| Errors              | **Core**          | `Data.TaggedError` domain failures                |

---

## 2. Domain Layer (Functional Core + Boundary Artifacts)

The `domain/` directory is **primarily** the Functional Core, but it also houses boundary
artifacts (contracts) that define the interface between Shell and Core. These boundary
artifacts contain no I/O, but they are not pure logic either — they define the **shape**
of data crossing the FC boundary.

| Subdirectory         | Classification | Why it lives in `domain/`                    |
| -------------------- | -------------- | -------------------------------------------- |
| `services/`          | **Pure FC**    | Pure functions, zero I/O                     |
| `{feature}.model.ts` | **Pure FC**    | Branded types, VOs, domain-state ADTs        |
| `errors.ts`          | **Pure FC**    | Domain error definitions                     |
| `contracts/`         | **Boundary**   | Use-case Input + Decision ADT (domain-typed) |

> **Note:** The API has no `validations/` directory in `domain/`. The equivalent of the
> web's Input Validations is the **Request Schema** in `api/schemas/requests.ts` — Effect
> Schema auto-validates before reaching handlers.

### 2.1 Directory Layout

```
features/{feature}/domain/
  +-- {feature}.model.ts       Constants, branded types, VOs, entities, domain-state ADTs   [FC]
  +-- errors.ts                Domain errors (Data.TaggedError)                              [FC]
  +-- contracts/               Use-case Input + Decision ADT interfaces (one per mutation)   [Boundary]
  +-- services/                Pure functions (validation, calculation, decisions)             [FC]
  +-- index.ts                 Barrel re-exports
```

### 2.2 Contract vs Model

In the API, there are two domain artifacts (no Validation layer — that's Request Schemas):

```
  HTTP request      Request Schema     Contract defines       Model represents
  (JSON body) ----> validates and ----> what the use-case ---> the domain
                    transforms          needs to execute       entities
```

| Aspect            | Model                                                  | Contract                                     |
| ----------------- | ------------------------------------------------------ | -------------------------------------------- |
| **Purpose**       | "What IS"                                              | "What an operation NEEDS + what it DECIDES"  |
| **Defines**       | Branded types, VOs, domain-state ADTs, entities        | Use-case Input + Decision ADT (output)       |
| **Used by**       | All layers                                             | Application Service (Three Phases)           |
| **Changes when**  | Business concepts change                               | Use-case requirements change                 |
| **Contains I/O?** | Never                                                  | Never                                        |
| **Example**       | `PlanWithPeriods`, `PeriodPhase`, `CancellationResult` | `PlanCreationInput` + `PlanCreationDecision` |

### 2.3 Models — Branded Types, Value Objects, Domain-State ADTs

The model file (`{feature}.model.ts`) is the domain vocabulary. It contains:

**Constants** — Named limits, never magic numbers:

```typescript
// domain/plan.model.ts
export const MIN_FASTING_DURATION = 1;
export const MAX_FASTING_DURATION = 168;
export const MIN_PERIODS = 1;
export const MAX_PERIODS = 31;
export const MAX_PLAN_NAME_LENGTH = 100;
```

**Branded Types** — Primitives with domain constraints:

```typescript
export type FastingDuration = number & Brand.Brand<'FastingDuration'>;

export const FastingDuration = Brand.refined<FastingDuration>(
  (n) => n >= MIN_FASTING_DURATION && n <= MAX_FASTING_DURATION && Number.isInteger(n * 4),
  (n) =>
    Brand.error(
      `Expected fasting duration between ${MIN_FASTING_DURATION}-${MAX_FASTING_DURATION}h in 15-min increments, got ${n}`,
    ),
);

export const FastingDurationSchema = S.Number.pipe(S.fromBrand(FastingDuration));
```

**Value Objects** — Multiple fields that always travel together (via `S.Class`):

```typescript
// domain/plan-template.model.ts
export class TemplatePeriodConfig extends S.Class<TemplatePeriodConfig>('TemplatePeriodConfig')({
  order: PeriodOrderSchema,
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}
```

**Entities** — Types with identity and lifecycle (via `S.Class`):

```typescript
export class Plan extends S.Class<Plan>('Plan')({
  id: PlanId,
  userId: S.UUID,
  name: PlanNameSchema,
  description: S.NullOr(PlanDescriptionSchema),
  startDate: S.DateFromSelf,
  status: PlanStatusSchema,
  createdAt: S.DateFromSelf,
  updatedAt: S.DateFromSelf,
}) {}

export class PlanWithPeriods extends S.Class<PlanWithPeriods>('PlanWithPeriods')({
  ...Plan.fields,
  periods: S.Array(Period),
}) {}
```

**Domain-State ADTs** — `Data.TaggedEnum` types that describe domain states reusable across
multiple use cases (not tied to a single operation):

```typescript
// domain/plan.model.ts — reusable across monitoring, display, reporting
export type CancellationResult = Data.TaggedEnum<{
  CompletedPeriod: { readonly fastingStartDate: Date; readonly fastingEndDate: Date };
  PartialFastingPeriod: {
    readonly fastingStartDate: Date;
    readonly fastingEndDate: Date;
    readonly originalFastingEndDate: Date;
  };
  CompletedFastingInEatingPhase: { readonly fastingStartDate: Date; readonly fastingEndDate: Date };
  DiscardedPeriod: {};
}>;
export const CancellationResult = Data.taggedEnum<CancellationResult>();
```

**Smart Constructors** — Parse unknown values into branded/VO types:

```typescript
export const createPeriodDateRange = (
  startDate: Date,
  endDate: Date,
  fastingStartDate: Date,
  fastingEndDate: Date,
  eatingStartDate: Date,
  eatingEndDate: Date,
): Effect.Effect<PeriodDateRange, ParseResult.ParseError> =>
  S.decodeUnknown(PeriodDateRange)({
    startDate,
    endDate,
    fastingStartDate,
    fastingEndDate,
    eatingStartDate,
    eatingEndDate,
  });

export const makePeriodDateRange = (/* ... */): Option.Option<PeriodDateRange> =>
  Effect.runSync(Effect.option(createPeriodDateRange(/* ... */)));
```

#### Type Decision Flowchart

```
Is it a single primitive with constraints?      --> Brand.refined (model)
Is it multiple fields that always go together?  --> S.Class (Value Object, model)
Are all variants the same shape?                --> S.Literal union (enum, model)
Do variants carry different data?
  Is it a domain state reusable across contexts?  --> Data.TaggedEnum (model)
  Is it the output of a specific use case?        --> Data.TaggedEnum (contract, alongside Input)
Does it need identity and lifecycle?            --> S.Class (Entity, model)
```

### 2.4 Contracts — Use-Case Interfaces

A contract defines the **full interface** of a mutating use case: what it **needs** (Input) and
what it **decides** (Decision ADT). One contract file per mutating use case. Both the Input and
the Decision live in the same file because they form a single logical unit.

#### Input — what the use case needs

Contracts define their Input as `S.Struct` schemas with a derived type alias:

```typescript
// domain/contracts/plan-creation.ts
export const PlanCreationInput = S.Struct({
  userId: S.UUID,
  activePlanId: S.NullOr(S.UUID),
  activeCycleId: S.NullOr(S.UUID),
  periodCount: S.Number.pipe(S.int(), S.positive()),
});
export type PlanCreationInput = S.Schema.Type<typeof PlanCreationInput>;
```

#### Decision ADT — what the use case produces

When a use case has multiple possible outcomes with variant-specific data, the contract also
defines a Decision ADT alongside the Input:

```typescript
// domain/contracts/plan-creation.ts — Input + Decision in same file
export type PlanCreationDecision = Data.TaggedEnum<{
  CanCreate: {};
  BlockedByActiveCycle: { readonly userId: string; readonly cycleId: string };
  BlockedByActivePlan: { readonly userId: string; readonly planId: string };
  InvalidPeriodCount: { readonly periodCount: number; readonly minPeriods: number; readonly maxPeriods: number };
}>;
export const PlanCreationDecision = Data.taggedEnum<PlanCreationDecision>();
```

#### The producer/consumer mental model

The contract is the **shared interface** between the Core service (producer) and the Shell
service (consumer):

```
  Core Service (producer)           Contract (shared interface)         Shell Service (consumer)
  +-----------------------+         +-------------------------+         +-----------------------+
  | imports Decision ADT  |         | defines:                |         | imports Decision ADT  |
  | to CONSTRUCT variants |-------->|   Input type            |<--------| to $MATCH on variants |
  | e.g. Decision.CanCreate()       |   Decision ADT          |         | e.g. $match(decision) |
  +-----------------------+         +-------------------------+         +-----------------------+
```

- **Core service produces** the decision — it imports the Decision ADT to construct variants
- **Shell service consumes** the decision — it imports the Decision ADT to `$match` on
  variants and dispatch the appropriate I/O (DB writes, error failures)
- The **contract** is the meeting point

**When to create a contract:**

- Every mutating operation (create, update, delete, cancel, complete) gets one
- Read-only operations (get, list) typically don't need one
- If the use case has a multi-variant outcome, add a Decision ADT to the contract

#### 2.4.1 Where Do TaggedEnums Go? The Producer/Consumer Rule

**Rule 1:** If a `Data.TaggedEnum` is the **output of a specific use case** → **contract**

**Rule 2:** If a `Data.TaggedEnum` describes a **domain state** reusable across multiple
contexts → **model**

| TaggedEnum                        | Location     | Why                                                |
| --------------------------------- | ------------ | -------------------------------------------------- |
| `PlanCreationDecision`            | **Contract** | Output of the plan-creation use case               |
| `PlanCancellationDecision`        | **Contract** | Output of the plan-cancellation use case           |
| `PlanCompletionDecision`          | **Contract** | Output of the plan-completion use case             |
| `PeriodUpdateDecision`            | **Contract** | Output of the period-update use case               |
| `PlanTemplateCreationDecision`    | **Contract** | Output of the template-creation use case           |
| `PlanTemplateDuplicationDecision` | **Contract** | Output of the template-duplication use case        |
| `PlanTemplateApplicationDecision` | **Contract** | Output of the template-application use case        |
| `CancellationResult`              | **Model**    | Domain state — reused in cancellation and cycles   |
| `PeriodPhase`                     | **Model**    | Domain state — reused across monitoring, display   |
| `PlanProgress`                    | **Model**    | Domain state — reused across dashboard, completion |

The intuition: **contracts are verbs** (operations), **models are nouns** (domain vocabulary).

### 2.5 Domain Functions and Service Adapters

Each `domain/services/` file contains two distinct artifacts:

| Artifact             | What it is                                            | Primary consumers                            |
| -------------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Domain Functions** | Standalone pure functions — the actual FC logic       | Tests (direct), Application Service (via DI) |
| **Service Adapter**  | `Effect.Service` that wraps the same functions for DI | Application Service, Repository              |

**Key difference from web:** In the API, **all consumers MUST use DI** (`yield* ServiceName`).
Standalone function exports exist **only for direct unit testing**. The web allows direct
imports in composables and actors because they are synchronous; the API has no such constraint.

#### Why not wrap domain functions in Effect?

These functions are pure, synchronous, deterministic, and dependency-free:

| Effect capability          | Needed? | Why not                                      |
| -------------------------- | ------- | -------------------------------------------- |
| Error channel (`E`)        | No      | They return values/booleans/ADTs, never fail |
| Dependency injection (`R`) | No      | They are pure — no deps to inject            |
| Async/fiber runtime        | No      | They are synchronous                         |
| Composition (`Effect.gen`) | No      | They compose with plain function calls       |

#### Two categories

| Category    | Purpose                              | Example functions                                   |
| ----------- | ------------------------------------ | --------------------------------------------------- |
| Validation  | Boolean predicates and Decision ADTs | `decidePlanCreation()`, `isPlanInProgress()`        |
| Calculation | Date math, period generation         | `calculatePeriodDates()`, `computeMetadataUpdate()` |

#### Mandatory FC header

Every domain function file must include:

```typescript
// ============================================================================
// FUNCTIONAL CORE — Pure validation functions (no I/O, no Effect error signaling, deterministic)
//
// These functions are the "Core" in Functional Core / Imperative Shell.
// They are exported both as standalone functions (for consumers that don't
// use dependency injection, e.g., tests) and wrapped in the Effect.Service below.
//
// Three Phases usage (in PlanService.createPlan):
//   1. COLLECTION (Shell): repository.hasActivePlanOrCycle(userId)
//   2. LOGIC (Core):       decidePlanCreation(input)
//   3. PERSISTENCE (Shell): repository.createPlan(...)
// ============================================================================
```

#### File structure (both artifacts in one file)

```typescript
// domain/services/plan-validation.service.ts

// ============================================================================
// Domain Functions (primary — the actual FC logic)
// ============================================================================

export const isPlanInProgress = (status: PlanStatus): boolean => status === 'InProgress';

export const decidePlanCreation = (input: PlanCreationInput): PlanCreationDecision => {
  if (input.periodCount < MIN_PERIODS || input.periodCount > MAX_PERIODS) {
    return PlanCreationDecision.InvalidPeriodCount({
      periodCount: input.periodCount,
      minPeriods: MIN_PERIODS,
      maxPeriods: MAX_PERIODS,
    });
  }
  if (input.activePlanId) {
    return PlanCreationDecision.BlockedByActivePlan({ userId: input.userId, planId: input.activePlanId });
  }
  if (input.activeCycleId) {
    return PlanCreationDecision.BlockedByActiveCycle({ userId: input.userId, cycleId: input.activeCycleId });
  }
  return PlanCreationDecision.CanCreate();
};

// ============================================================================
// Service Adapter (secondary — DI wrapper for Application Services)
// ============================================================================

export interface IPlanValidationService {
  isPlanInProgress(status: PlanStatus): boolean;
  decidePlanCreation(input: PlanCreationInput): PlanCreationDecision;
}

export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  effect: Effect.succeed({
    isPlanInProgress,
    decidePlanCreation,
  } satisfies IPlanValidationService),
  accessors: true,
}) {}
```

### 2.6 Errors — Data.TaggedError vs S.TaggedError

| Error Kind   | Mechanism          | Location                 | Purpose                          |
| ------------ | ------------------ | ------------------------ | -------------------------------- |
| Domain Error | `Data.TaggedError` | `domain/errors.ts`       | In-memory business failures      |
| Repo Error   | `Data.TaggedError` | `repositories/errors.ts` | Database operation failures      |
| Schema Error | `S.TaggedError`    | `api/schemas/errors.ts`  | Wire-format HTTP response errors |

```typescript
// Domain error (used in application service)
export class PlanAlreadyActiveError extends Data.TaggedError('PlanAlreadyActiveError')<{
  message: string;
  userId: string;
}> {}

// Schema error (used in handler for HTTP response)
export class PlanAlreadyActiveErrorSchema extends S.TaggedError<PlanAlreadyActiveErrorSchema>()(
  'PlanAlreadyActiveError',
  {
    message: S.String,
    userId: S.UUID,
  },
) {}
```

Domain errors use `Data.TaggedError` — they are in-memory typed failures that flow through
Effect's error channel. Schema errors use `S.TaggedError` — they define the wire format of
HTTP error responses. The **handler** is the boundary that maps one to the other via
`Effect.catchTags`.

### 2.7 Validation Layers

> "Validate at the boundary, trust inside."

The architecture defines **4 mandatory validation layers**. Each layer validates a different
concern; no layer duplicates another's work.

| Layer                       | Location                               | Responsibility                      | What It Validates                                     | Plan Example                                                          |
| --------------------------- | -------------------------------------- | ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| **1. Input Schema**         | `api/schemas/requests.ts`              | Parse & transform incoming JSON     | INPUT (string → Date, min/max lengths, enums)         | `CreatePlanRequestSchema` validates `periods[].fastingDuration ≥ 1`   |
| **2. Domain Validation**    | `domain/services/*-validation.service` | Pure business rules (FC)            | LOGIC (no I/O, deterministic)                         | `decidePlanCreation` checks period count, active plan/cycle conflicts |
| **3. Service Coordination** | `services/{feature}.service.ts`        | Orchestrate validation + repository | FLOW (returns typed errors via Decision ADT matching) | `PlanService.createPlan` coordinates Collection → Logic → Persistence |
| **4. Repository Output**    | `repositories/*.repository.ts`         | Validate DB returns                 | OUTPUT (trust input, validate output from DB)         | `getPlanWithPeriods` validates result exists, maps to domain entity   |

**Checklist:**

- [ ] Request schema transforms and validates input before handler
- [ ] Domain validation service contains pure business rules (testable without mocks)
- [ ] Application service coordinates validation + repository (Three Phases)
- [ ] Repository validates output from DB, trusts input from service

### 2.8 Data Seams

Architectural boundaries where data transforms between layers. Each seam has a clear owner
and transformation direction.

| Seam                         | From                         | To                          | Transformation                                     | Owner       |
| ---------------------------- | ---------------------------- | --------------------------- | -------------------------------------------------- | ----------- |
| **HTTP → Handler**           | JSON body (unknown)          | Request Schema instance     | `S.Class` auto-decode (framework)                  | Framework   |
| **Handler → Service**        | Request Schema fields        | Primitive / Date / string   | Destructure schema, pass to service method         | Handler     |
| **Service → FC**             | Primitive / domain type args | Contract Input (`S.Struct`) | Build input struct for decision function           | App Service |
| **FC → Service**             | Decision ADT                 | Effect (fail or proceed)    | `$match` on Decision ADT variants                  | App Service |
| **Service → Repository**     | Domain types / primitives    | SQL params (Drizzle)        | Pass directly (repository trusts input)            | Repository  |
| **Repository → Service**     | DB row (unknown)             | Domain entity / VO          | Validate output, map fields, construct domain type | Repository  |
| **Service → Handler**        | Domain entity                | Domain entity (passthrough) | No transformation (handler receives typed result)  | —           |
| **Handler → HTTP**           | Domain entity                | JSON response               | Effect HTTP serialization via response schema      | Framework   |
| **Error: Service → Handler** | `Data.TaggedError`           | `S.TaggedError`             | `Effect.catchTags` maps domain → schema errors     | Handler     |

**Plan example — Create Plan seam trace:**

```
JSON { name, startDate, periods }     →  CreatePlanRequestSchema (Layer 1)
  → handler destructures fields       →  planService.createPlan(userId, startDate, periods, name)
  → service builds { userId, activePlanId, activeCycleId, periodCount }  →  decidePlanCreation (Layer 2)
  → PlanCreationDecision.CanCreate()  →  $match dispatches to persistence (Layer 3)
  → repository.createPlan(...)        →  INSERT + SELECT → validate output (Layer 4)
  → PlanWithPeriods domain entity     →  handler returns → HTTP 201
```

---

## 3. Shell Layers Breakdown

### 3.1 Request Schemas

**File:** `api/schemas/requests.ts`

Effect Schema classes that auto-validate incoming JSON before the handler runs. This is
the API equivalent of the web's Input Validations.

**Responsibility:**

- Parse and transform incoming JSON (strings → dates, validate ranges, check formats)
- Reject malformed requests before they reach business logic
- Provide typed input to the handler via `{ payload }`

**Structure:**

```typescript
// api/schemas/requests.ts
export class CreatePlanRequestSchema extends S.Class<CreatePlanRequestSchema>('CreatePlanRequest')({
  name: S.String.pipe(
    S.minLength(1, { message: () => 'Name is required' }),
    S.maxLength(100, { message: () => 'Name must be at most 100 characters' }),
  ),
  description: S.optional(
    S.String.pipe(S.maxLength(500, { message: () => 'Description must be at most 500 characters' })),
  ),
  startDate: S.Date,
  periods: S.Array(PeriodInputSchema).pipe(
    S.minItems(1, { message: () => 'Plan must have at least 1 period' }),
    S.maxItems(31, { message: () => 'Plan cannot have more than 31 periods' }),
  ),
}) {}
```

**Key points:**

- Validation happens automatically — the framework rejects invalid requests before the handler
- Use `S.Date` for ISO string → Date transformation
- Use `S.optional(...)` for optional fields
- Error messages use lazy evaluation: `{ message: () => '...' }`
- Shared schemas from `@ketone/shared` (`EmailSchema`, `PasswordSchema`) should be reused

### 3.2 API Group

**File:** `api/{feature}-api.ts`

Declarative endpoint definitions using `HttpApiGroup`. This is the single source of truth
for the feature's HTTP contract.

**Responsibility:**

- Define endpoints (method, path, path params)
- Wire request/response/error schemas to each endpoint
- Attach middleware (authentication)

**Structure:**

```typescript
// api/plan-api.ts
export class PlanApiGroup extends HttpApiGroup.make('plan')
  .add(
    HttpApiEndpoint.post('createPlan', '/v1/plans')
      .setPayload(CreatePlanRequestSchema)
      .addSuccess(PlanWithPeriodsResponseSchema, { status: 201 })
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanAlreadyActiveErrorSchema, { status: 409 })
      .addError(InvalidPeriodCountErrorSchema, { status: 422 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  )
  .add(
    HttpApiEndpoint.get('getPlan', '/v1/plans/:id')
      .setPath(S.Struct({ id: PlanId }))
      .addSuccess(PlanWithPeriodsResponseSchema)
      .addError(UnauthorizedErrorSchema, { status: 401 })
      .addError(PlanNotFoundErrorSchema, { status: 404 })
      .addError(PlanRepositoryErrorSchema, { status: 500 })
      .middleware(Authentication),
  ) {}
```

**Key points:**

- Path params use branded types where possible (`PlanId` instead of `S.UUID`)
- Every possible error is declared with its HTTP status code
- `Authentication` middleware provides `CurrentUser` context

### 3.3 Handler

**File:** `api/{feature}-api-handler.ts`

The handler is the HTTP boundary. It extracts the user, calls the application service, and
maps domain errors to HTTP schema errors. The handler contains **no business logic**.

**Responsibility:**

- Extract `CurrentUser` from auth middleware
- Log the incoming request
- Call the application service
- Map domain errors → HTTP schema errors via `Effect.catchTags`
- Annotate logs with handler context

**Structure:**

```typescript
// api/plan-api-handler.ts
export const PlanApiLive = HttpApiBuilder.group(Api, 'plan', (handlers) =>
  Effect.gen(function* () {
    const planService = yield* PlanService;

    return handlers.handle('createPlan', ({ payload }) =>
      Effect.gen(function* () {
        const currentUser = yield* CurrentUser;
        const userId = currentUser.userId;

        yield* Effect.logInfo(`POST /v1/plans - Request received for user ${userId}`);

        const plan = yield* planService
          .createPlan(userId, payload.startDate, [...payload.periods], payload.name, payload.description)
          .pipe(
            Effect.catchTags({
              PlanRepositoryError: (error) => handleRepositoryError(error),
              PlanAlreadyActiveError: (error) =>
                Effect.fail(new PlanAlreadyActiveErrorSchema({ message: error.message, userId })),
              InvalidPeriodCountError: (error) =>
                Effect.fail(
                  new InvalidPeriodCountErrorSchema({
                    message: error.message,
                    periodCount: error.periodCount,
                    minPeriods: error.minPeriods,
                    maxPeriods: error.maxPeriods,
                  }),
                ),
            }),
          );

        return plan;
      }).pipe(Effect.annotateLogs({ handler: 'plan.createPlan' })),
    );
  }),
);
```

**Error mapping pattern:**

The handler maps every domain error to its HTTP schema counterpart. Repository errors
are sanitized — the cause is logged server-side but not sent to the client:

```typescript
const handleRepositoryError = (error: PlanRepositoryError) =>
  Effect.gen(function* () {
    if (error.cause) {
      yield* Effect.logError('Repository error cause', { cause: error.cause });
    }
    return yield* Effect.fail(new PlanRepositoryErrorSchema({ message: 'A database error occurred' }));
  });
```

### 3.4 Application Service (Three Phases)

**File:** `services/{feature}.service.ts`

The orchestration layer that coordinates Collection → Logic → Persistence. This is where
the domain functions (FC) are called and their decisions are interpreted.

**The Three Phases:**

```
  Phase 1: COLLECTION          Phase 2: LOGIC             Phase 3: PERSISTENCE
  (Shell — Repository)         (Core — Domain Fn)         (Shell — Repository)
  +-------------------+        +-------------------+      +-------------------+
  | Fetch data from   | -----> | Pure decision     | ---> | Write to DB       |
  | database or       |        | function returns  |      | based on the      |
  | caller input      |        | Decision ADT      |      | decision variant  |
  +-------------------+        +-------------------+      +-------------------+
```

**Responsibility:**

- Coordinate Collection → Logic → Persistence
- Inject all dependencies via `yield*` (domain services, repositories)
- Match on Decision ADTs to dispatch the correct persistence operation
- Get current time via `DateTime.nowAsDate` when needed by FC

**Key difference from web:** The API uses DI directly (`yield* PlanService`) — there are
no `program*` exports. The web needs `program*` because actors invoke services via
`runWithUi` which requires all layers pre-provided.

**Three Phases example (createPlan):**

```typescript
// services/plan.service.ts
createPlan: (userId, startDate, periods, name, description) =>
  Effect.gen(function* () {
    // Collection phase
    const { activePlanId, activeCycleId } = yield* repository.hasActivePlanOrCycle(userId);

    // Logic phase (pure decision)
    const creationDecision = validationService.decidePlanCreation({
      userId, activePlanId, activeCycleId, periodCount: periods.length,
    });

    yield* PlanCreationDecision.$match(creationDecision, {
      CanCreate: () => Effect.void,
      BlockedByActivePlan: () =>
        Effect.fail(new PlanAlreadyActiveError({ message: 'User already has an active plan', userId })),
      BlockedByActiveCycle: () =>
        Effect.fail(new ActiveCycleExistsError({ message: 'Cannot create plan while user has an active cycle', userId })),
      InvalidPeriodCount: ({ periodCount, minPeriods, maxPeriods }) =>
        Effect.fail(new InvalidPeriodCountError({
          message: `Plan must have between ${minPeriods} and ${maxPeriods} periods, got ${periodCount}`,
          periodCount, minPeriods, maxPeriods,
        })),
    });

    const periodData = calculationService.calculatePeriodDates(startDate, periods);

    // Persistence phase
    const plan = yield* repository.createPlan(userId, startDate, periodData, name, description);
    return plan;
  }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
```

**Three Phases example (cancelPlan — complex with clock and branching persistence):**

```typescript
cancelPlan: (userId, planId) =>
  Effect.gen(function* () {
    // Collection phase
    const planOption = yield* repository.getPlanWithPeriods(userId, planId);
    if (Option.isNone(planOption)) {
      return yield* Effect.fail(new PlanNotFoundError({ message: 'Plan not found', userId, planId }));
    }
    const planWithPeriods = planOption.value;

    // Logic phase (pure decision + clock access in shell)
    const now = yield* DateTime.nowAsDate;
    const cancellationDecision = cancellationService.decidePlanCancellation({
      planId: planWithPeriods.id, status: planWithPeriods.status,
      periods: planWithPeriods.periods, now,
    });

    // Persistence phase (match on decision ADT)
    const cancelledPlan = yield* PlanCancellationDecision.$match(cancellationDecision, {
      InvalidState: ({ currentStatus }) =>
        Effect.fail(new PlanInvalidStateError({
          message: `Plan must be InProgress to cancel, but is ${currentStatus}`,
          currentState: currentStatus, expectedState: 'InProgress',
        })),
      Cancel: ({ completedPeriodsFastingDates, inProgressPeriodFastingDates, cancelledAt }) =>
        repository.cancelPlanWithCyclePreservation(
          userId, planId, inProgressPeriodFastingDates,
          [...completedPeriodsFastingDates], cancelledAt,
        ),
    });

    return cancelledPlan;
  }).pipe(Effect.annotateLogs({ service: 'PlanService' })),
```

**Dependencies are declared explicitly:**

```typescript
export class PlanService extends Effect.Service<PlanService>()('PlanService', {
  effect: Effect.gen(function* () {
    const repository = yield* PlanRepository;
    const validationService = yield* PlanValidationService;
    const calculationService = yield* PeriodCalculationService;
    const cancellationService = yield* PlanCancellationService;
    // ...
    return { createPlan: (...) => ..., cancelPlan: (...) => ... };
  }),
  dependencies: [
    PlanRepository.Default,
    PlanValidationService.Default,
    PeriodCalculationService.Default,
    PlanCancellationService.Default,
    PlanCompletionService.Default,
    PeriodUpdateService.Default,
    PlanMetadataService.Default,
  ],
  accessors: true,
}) {}
```

### 3.5 Repository

**File:** `repositories/{feature}.repository.postgres.ts`

The persistence layer. Handles database access using Drizzle ORM + Effect, validates
output from the database, and enforces concurrency guards.

**Responsibility:**

- Execute database queries via Drizzle ORM
- Validate output (trust input from service, validate what comes back from DB)
- Map DB constraint violations to domain errors (unique index → `PlanAlreadyActiveError`)
- Enforce concurrency guards (check plan is still `InProgress` before mutation)
- Apply boundary mappers (DB record → domain entity)

**Key principle — Trust input, validate output:**

```typescript
// Input from service is already validated — no need to re-check
// Output from DB could be unexpected — validate it
const results = yield* drizzle.select().from(plansTable).where(eq(plansTable.id, planId));
const result = results[0];
if (!result) {
  return yield* Effect.fail(new PlanNotFoundError({ ... }));
}
```

**Concurrency guard pattern:**

```typescript
// Verify plan is still InProgress before mutation (prevents race conditions)
const updateResult = yield* drizzle
  .update(plansTable)
  .set({ status: 'Cancelled' })
  .where(and(
    eq(plansTable.id, planId),
    eq(plansTable.userId, userId),
    eq(plansTable.status, 'InProgress'),  // Concurrency guard
  ))
  .returning();

if (updateResult.length === 0) {
  return yield* Effect.fail(new PlanInvalidStateError({ ... }));
}
```

**DB constraint → domain error mapping:**

```typescript
yield* drizzle.insert(plansTable).values({ ... }).pipe(
  Effect.mapError((error) => {
    if (isUniqueViolation(error, 'plans_user_active_unique')) {
      return new PlanAlreadyActiveError({ message: 'User already has an active plan', userId });
    }
    return new PlanRepositoryError({ message: 'Failed to create plan', cause: error });
  }),
);
```

**Structure:**

```typescript
export class PlanRepository extends Effect.Service<PlanRepository>()('PlanRepository', {
  effect: Effect.gen(function* () {
    const drizzle = yield* PgDrizzle.PgDrizzle;

    return {
      createPlan: (userId, startDate, periods, name, description) =>
        Effect.gen(function* () {
          // Transaction: insert plan + periods
          // Map unique violation → PlanAlreadyActiveError
          // Validate and return PlanWithPeriods
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),

      cancelPlanWithCyclePreservation: (userId, planId, inProgressDates, completedDates, cancelledAt) =>
        Effect.gen(function* () {
          // Concurrency guard: plan must be InProgress
          // Create cycles for completed/in-progress periods
          // Return cancelled Plan
        }).pipe(Effect.annotateLogs({ repository: 'PlanRepository' })),
    };
  }),
  dependencies: [],
  accessors: true,
}) {}
```

---

## 4. Complete Data Flow Diagrams

### 4.1 Create Plan (Full Journey)

```
Client                Handler              App Service            FC (Domain)          Repository
  |                     |                     |                     |                    |
  | POST /v1/plans      |                     |                     |                    |
  | { name, startDate,  |                     |                     |                    |
  |   periods: [...] }  |                     |                     |                    |
  |-------------------->|                     |                     |                    |
  |                     | CurrentUser         |                     |                    |
  |                     | (from middleware)    |                     |                    |
  |                     |-------------------->|                     |                    |
  |                     | createPlan(userId,  |                     |                    |
  |                     |   startDate, ...)   |                     |                    |
  |                     |                     |                     |                    |
  |                     |          Phase 1: COLLECTION              |                    |
  |                     |                     |------------------------------------->    |
  |                     |                     | hasActivePlanOrCycle(userId)              |
  |                     |                     |<-------------------------------------    |
  |                     |                     | { activePlanId, activeCycleId }           |
  |                     |                     |                     |                    |
  |                     |          Phase 2: LOGIC (FC)              |                    |
  |                     |                     |-------------------->|                    |
  |                     |                     | decidePlanCreation( |                    |
  |                     |                     |   { userId,         |                    |
  |                     |                     |     activePlanId,   |                    |
  |                     |                     |     activeCycleId,  |                    |
  |                     |                     |     periodCount })  |                    |
  |                     |                     |<--------------------|                    |
  |                     |                     | PlanCreationDecision.CanCreate()          |
  |                     |                     |                     |                    |
  |                     |                     |-------------------->|                    |
  |                     |                     | calculatePeriodDates(startDate, periods)  |
  |                     |                     |<--------------------|                    |
  |                     |                     | periodData[]        |                    |
  |                     |                     |                     |                    |
  |                     |          Phase 3: PERSISTENCE             |                    |
  |                     |                     |------------------------------------->    |
  |                     |                     | createPlan(userId, startDate,             |
  |                     |                     |   periodData, name, description)          |
  |                     |                     |<-------------------------------------    |
  |                     |                     | PlanWithPeriods                           |
  |                     |<--------------------|                     |                    |
  |                     | return plan         |                     |                    |
  |<--------------------|                     |                     |                    |
  | 201 { plan }        |                     |                     |                    |
```

### 4.2 Cancel Plan (Decision ADT with Branching Persistence)

This flow demonstrates the Three Phases pattern with a Decision ADT that has multiple
persistence branches and requires clock access:

```
Client                Handler              App Service            FC (Domain)          Repository
  |                     |                     |                     |                    |
  | POST /plans/:id/    |                     |                     |                    |
  |   cancel            |                     |                     |                    |
  |-------------------->|                     |                     |                    |
  |                     |-------------------->|                     |                    |
  |                     | cancelPlan(userId,  |                     |                    |
  |                     |   planId)           |                     |                    |
  |                     |                     |                     |                    |
  |                     |          Phase 1: COLLECTION              |                    |
  |                     |                     |------------------------------------->    |
  |                     |                     | getPlanWithPeriods(userId, planId)        |
  |                     |                     |<-------------------------------------    |
  |                     |                     | Option<PlanWithPeriods>                   |
  |                     |                     |                     |                    |
  |                     |          Phase 2: LOGIC (FC)              |                    |
  |                     |                     | now = DateTime.nowAsDate (shell clock)    |
  |                     |                     |-------------------->|                    |
  |                     |                     | decidePlanCancellation(                   |
  |                     |                     |   { planId, status, |                    |
  |                     |                     |     periods, now }) |                    |
  |                     |                     |<--------------------|                    |
  |                     |                     | PlanCancellationDecision                  |
  |                     |                     |   .Cancel({         |                    |
  |                     |                     |     completedPeriodsFastingDates,         |
  |                     |                     |     inProgressPeriodFastingDates,         |
  |                     |                     |     cancelledAt })  |                    |
  |                     |                     |                     |                    |
  |                     |          Phase 3: PERSISTENCE             |                    |
  |                     |                     | $match(decision, {  |                    |
  |                     |                     |   Cancel: () =>     |                    |
  |                     |                     |------------------------------------->    |
  |                     |                     |     cancelPlanWithCyclePreservation(      |
  |                     |                     |       userId, planId,                     |
  |                     |                     |       inProgressDates,                    |
  |                     |                     |       completedDates,                     |
  |                     |                     |       cancelledAt)  |                    |
  |                     |                     |<-------------------------------------    |
  |                     |                     |   InvalidState: () =>                    |
  |                     |                     |     Effect.fail(PlanInvalidStateError)    |
  |                     |                     | })                  |                    |
  |                     |<--------------------|                     |                    |
  |                     | catchTags:          |                     |                    |
  |                     |   Domain → Schema   |                     |                    |
  |<--------------------|                     |                     |                    |
  | 200 { plan }        |                     |                     |                    |
```

### 4.3 Create Template from Plan (Extraction + Limit Guard)

This flow demonstrates the plan-template's own Three Phases pattern with a limit-check
decision and a pure extraction function that strips dates/IDs from an existing plan.

```
Client                Handler              PlanTemplate           FC (Domain)          Template Repo     PlanService
  |                     |                  Service                 |                    |                 |
  | POST /v1/plan-      |                     |                    |                    |                 |
  |  templates/from-plan|                     |                    |                    |                 |
  | { planId }          |                     |                    |                    |                 |
  |-------------------->|                     |                    |                    |                 |
  |                     |-------------------->|                    |                    |                 |
  |                     | createFromPlan(     |                    |                    |                 |
  |                     |   userId, planId)   |                    |                    |                 |
  |                     |                     |                    |                    |                 |
  |                     |          Phase 1: COLLECTION             |                    |                 |
  |                     |                     |------------------------------------------+---------------->|
  |                     |                     | planService.getPlanWithPeriods(userId, planId)              |
  |                     |                     |<-----------------------------------------+-----------------|
  |                     |                     | PlanWithPeriods                           |                 |
  |                     |                     |----------------------------------->      |                 |
  |                     |                     | countPlanTemplates(userId)                |                 |
  |                     |                     |<-----------------------------------      |                 |
  |                     |                     | currentCount: number                     |                 |
  |                     |                     |                    |                    |                 |
  |                     |          Phase 2: LOGIC (FC)             |                    |                 |
  |                     |                     |------------------>|                    |                 |
  |                     |                     | decidePlanTemplate|                    |                 |
  |                     |                     |   Creation({      |                    |                 |
  |                     |                     |   currentCount,   |                    |                 |
  |                     |                     |   maxTemplates }) |                    |                 |
  |                     |                     |<------------------|                    |                 |
  |                     |                     | CanCreate()       |                    |                 |
  |                     |                     |                   |                    |                 |
  |                     |                     |------------------>|                    |                 |
  |                     |                     | extractTemplate   |                    |                 |
  |                     |                     |   FromPlan(plan)  |                    |                 |
  |                     |                     |<------------------|                    |                 |
  |                     |                     | { name, desc,     |                    |                 |
  |                     |                     |   periods[] }     |                    |                 |
  |                     |                     |                   |                    |                 |
  |                     |          Phase 3: PERSISTENCE            |                    |                 |
  |                     |                     |----------------------------------->      |                 |
  |                     |                     | createPlanTemplate(userId, name,         |                 |
  |                     |                     |   description, periods)                  |                 |
  |                     |                     |<-----------------------------------      |                 |
  |                     |                     | PlanTemplateWithPeriods                  |                 |
  |                     |<--------------------|                   |                    |                 |
  |<--------------------|                     |                   |                    |                 |
  | 201 { template }    |                     |                   |                    |                 |
```

### 4.4 Apply Template to Plan (Cross-Feature Orchestration)

This is the canonical **cross-feature delegation** pattern. The template service validates
template-specific concerns, then delegates plan creation to `PlanService` which owns
the plan-domain rules (active plan check, cycle conflict, period calculation).

```
Client                Handler              PlanTemplate           FC (Domain)          Template Repo     PlanService
  |                     |                  Service                 |                    |                 |
  | POST /v1/plan-      |                     |                    |                    |                 |
  |  templates/:id/apply|                     |                    |                    |                 |
  | { startDate }       |                     |                    |                    |                 |
  |-------------------->|                     |                    |                    |                 |
  |                     |-------------------->|                    |                    |                 |
  |                     | applyPlanTemplate(  |                    |                    |                 |
  |                     |   userId, id, date) |                    |                    |                 |
  |                     |                     |                    |                    |                 |
  |                     |          Phase 1: COLLECTION             |                    |                 |
  |                     |                     |----------------------------------->      |                 |
  |                     |                     | getPlanTemplateWithPeriods(userId, id)   |                 |
  |                     |                     |<-----------------------------------      |                 |
  |                     |                     | Option<PlanTemplateWithPeriods>          |                 |
  |                     |                     |                    |                    |                 |
  |                     |          Phase 2: LOGIC (FC)             |                    |                 |
  |                     |                     |------------------>|                    |                 |
  |                     |                     | decidePlanTemplate|                    |                 |
  |                     |                     |   Application({   |                    |                 |
  |                     |                     |   periodConfigs,  |                    |                 |
  |                     |                     |   startDate })    |                    |                 |
  |                     |                     |<------------------|                    |                 |
  |                     |                     | CanApply({ periodConfigs })             |                 |
  |                     |                     |                   |                    |                 |
  |                     |                     |------------------>|                    |                 |
  |                     |                     | toPeriodInputs(   |                    |                 |
  |                     |                     |   periodConfigs)  |                    |                 |
  |                     |                     |<------------------|                    |                 |
  |                     |                     | PeriodInput[]     |                    |                 |
  |                     |                     |                   |                    |                 |
  |                     |          Phase 3: DELEGATION (Cross-Feature)                 |                 |
  |                     |                     |------------------------------------------+---------------->|
  |                     |                     | planService.createPlan(userId, startDate,                  |
  |                     |                     |   periodInputs, name, description)                         |
  |                     |                     |   (PlanService runs its OWN Three Phases internally)       |
  |                     |                     |<-----------------------------------------+-----------------|
  |                     |                     | PlanWithPeriods                          |                 |
  |                     |                     |                   |                    |                 |
  |                     |                     | Side-effect: touchLastUsedAt (non-critical, errors swallowed)
  |                     |                     |----------------------------------->      |                 |
  |                     |<--------------------|                   |                    |                 |
  |<--------------------|                     |                   |                    |                 |
  | 201 { plan }        |                     |                   |                    |                 |
```

**Key pattern:** The template service does NOT duplicate plan-domain logic. It delegates to
`PlanService.createPlan()` which runs its own Three Phases (checking active plan/cycle
conflicts, calculating period dates). Errors from the plan domain propagate through the
template service's error channel and are caught in the handler.

### 4.5 Duplicate Template (Limit Guard + Pure Transformation)

```
Client                Handler              PlanTemplate           FC (Domain)          Template Repo
  |                     |                  Service                 |                    |
  | POST /v1/plan-      |                     |                    |                    |
  |  templates/:id/     |                     |                    |                    |
  |  duplicate          |                     |                    |                    |
  |-------------------->|                     |                    |                    |
  |                     |-------------------->|                    |                    |
  |                     | duplicatePlan       |                    |                    |
  |                     |  Template(userId,id)|                    |                    |
  |                     |                     |                    |                    |
  |                     |          Phase 1: COLLECTION             |                    |
  |                     |                     |----------------------------------->      |
  |                     |                     | getPlanTemplateWithPeriods(userId, id)   |
  |                     |                     |<-----------------------------------      |
  |                     |                     | Option<PlanTemplateWithPeriods>          |
  |                     |                     |----------------------------------->      |
  |                     |                     | countPlanTemplates(userId)               |
  |                     |                     |<-----------------------------------      |
  |                     |                     | currentCount: number                    |
  |                     |                     |                    |                    |
  |                     |          Phase 2: LOGIC (FC)             |                    |
  |                     |                     |------------------>|                    |
  |                     |                     | decidePlanTemplate|                    |
  |                     |                     |   Duplication({   |                    |
  |                     |                     |   currentCount,   |                    |
  |                     |                     |   maxTemplates }) |                    |
  |                     |                     |<------------------|                    |
  |                     |                     | CanDuplicate()    |                    |
  |                     |                     |                   |                    |
  |                     |                     |------------------>|                    |
  |                     |                     | buildDuplicate    |                    |
  |                     |                     |   Name(source)    |                    |
  |                     |                     |<------------------|                    |
  |                     |                     | "Plan (copy)"     |                    |
  |                     |                     |                   |                    |
  |                     |          Phase 3: PERSISTENCE            |                    |
  |                     |                     |----------------------------------->      |
  |                     |                     | createPlanTemplate(userId, newName,      |
  |                     |                     |   description, [...periods])             |
  |                     |                     |<-----------------------------------      |
  |                     |                     | PlanTemplateWithPeriods                  |
  |                     |<--------------------|                   |                    |
  |<--------------------|                     |                   |                    |
  | 201 { template }    |                     |                   |                    |
```

---

## 5. Responsibility Matrix

### Handler

| YES                                       | NO                                |
| ----------------------------------------- | --------------------------------- |
| Extract `CurrentUser` from middleware     | Business rules (`if count >= 20`) |
| Log incoming request                      | Database queries                  |
| Map domain errors → HTTP schema errors    | Clock access (`DateTime.now`)     |
| `Effect.annotateLogs({ handler: '...' })` | DTO → domain transformation       |
| Normalize simple input (trim description) | Decision ADT matching             |

### Application Service

| YES                                            | NO                                     |
| ---------------------------------------------- | -------------------------------------- |
| Three Phases orchestration                     | HTTP concerns (status codes, headers)  |
| Call FC decision functions                     | Direct SQL queries                     |
| Match on Decision ADTs to dispatch persistence | Inline business rules                  |
| Get current time via `DateTime.nowAsDate`      | Import standalone FC functions         |
| Inject all dependencies via `yield*`           | Return schema errors (`S.TaggedError`) |
| `Effect.annotateLogs({ service: '...' })`      | Format strings for HTTP response       |

### Repository

| YES                                                | NO                            |
| -------------------------------------------------- | ----------------------------- |
| Execute database queries (Drizzle ORM)             | Business rules or decisions   |
| Validate output from DB                            | Error mapping to HTTP schemas |
| Map DB constraint violations → domain errors       | Call FC functions directly    |
| Concurrency guards (`WHERE status = 'InProgress'`) | Clock access                  |
| `Effect.annotateLogs({ repository: '...' })`       | Three Phases orchestration    |
| Boundary mapping (DB record → domain entity)       | Input validation              |

### Domain Service (FC)

| YES                                       | NO                               |
| ----------------------------------------- | -------------------------------- |
| Pure functions returning booleans or ADTs | `Effect.fail` (belongs in Shell) |
| Date calculations (deterministic)         | Database access                  |
| Decision ADT construction                 | HTTP requests                    |
| `Data.TaggedEnum` matching (internal)     | Clock access (`new Date()`)      |
| Named constants for business limits       | Logging                          |

---

## 6. API <-> Web Analogy Table

| API Concept           | Web Equivalent           | Web File Location                          | Shared Purpose             |
| --------------------- | ------------------------ | ------------------------------------------ | -------------------------- |
| Handler               | Actor                    | `actors/*.actor.ts`                        | Orchestrates the operation |
| Repository            | API Client (Gateway)     | `services/*-api-client.service.ts`         | Talks to external system   |
| Application Service   | Application Service      | `services/*-application.service.ts`        | Three Phases coordinator   |
| Request Schema        | Input Validation         | `domain/validations/*-input.validation.ts` | Validates incoming data    |
| Response Schema       | Boundary Mapper (decode) | Inside gateway service                     | Transforms wire → domain   |
| Domain Service        | Domain Service           | `domain/services/*.service.ts`             | Pure business logic        |
| Domain Error          | Domain Error             | `domain/errors.ts`                         | Typed failures             |
| Contract              | Contract                 | `domain/contracts/*.contract.ts`           | Use-case interface         |
| `Effect.annotateLogs` | `Effect.annotateLogs`    | All services                               | Structured logging         |

### Key Differences

| Concern                 | API                                | Web                                     |
| ----------------------- | ---------------------------------- | --------------------------------------- |
| External I/O            | Database (PostgreSQL)              | HTTP API (backend)                      |
| State management        | Stateless (per-request)            | Stateful (XState machines)              |
| Output boundary         | JSON HTTP response                 | Reactive Vue interface                  |
| UUID generation         | Repository (authoritative)         | Trusts API (except temp IDs)            |
| Time for business logic | Service (`DateTime.nowAsDate`)     | Trusts API (server-side)                |
| FC consumption          | **DI only** (`yield* Service`)     | Direct imports in actors/composables    |
| Standalone FC exports   | For testing only                   | For composables, actors, and testing    |
| Error presentation      | Error codes in JSON response       | Toast messages via composable           |
| Validation layer        | Request Schema (auto by framework) | Input Validation (manual in composable) |

---

## 7. The FC Delegation Rule

### The Practical Test

Before writing an `if/else` or comparison in a handler, service, or repository, ask:

> "Is this a **business decision** (rules about the domain) OR a **shell concern**
> (I/O, error mapping, coordination)?"

**If it is a business decision, extract it as a domain function** (`domain/services/`).

### Four-Question Litmus Test

| #   | Question                                                          | If YES                             | If NO      |
| --- | ----------------------------------------------------------------- | ---------------------------------- | ---------- |
| 1   | Does it depend on **business rules**?                             | Domain: `decidePlanCreation()`     | Continue   |
| 2   | Would the decision **exist without HTTP**?                        | Domain: `isPlanInProgress(status)` | Continue   |
| 3   | Does it depend on **database mechanics** (SQL, transactions)?     | Repository                         | Continue   |
| 4   | Does it depend on **HTTP concerns** (status codes, auth context)? | Handler                            | Re-examine |

### Examples

| Code                                       | Current Location | Correct Location                | Why                               |
| ------------------------------------------ | ---------------- | ------------------------------- | --------------------------------- |
| `periods.length < MIN_PERIODS`             | App Service      | FC: `decidePlanCreation(input)` | Business rule (period count)      |
| `status === 'InProgress'`                  | App Service      | FC: `isPlanInProgress(status)`  | Business rule (state check)       |
| `Effect.fail(new PlanNotFoundError(...))`  | App Service      | App Service                     | Shell concern (Option → error)    |
| `now = yield* DateTime.nowAsDate`          | App Service      | App Service                     | Shell concern (clock access)      |
| `Effect.catchTags({ ... })`                | Handler          | Handler                         | Shell concern (error mapping)     |
| `WHERE status = 'InProgress'`              | Repository       | Repository                      | Shell concern (concurrency guard) |
| `calculatePeriodDates(startDate, periods)` | FC               | FC                              | Pure calculation                  |

### Anti-Pattern Gallery

**1. Inline business rule in application service:**

```typescript
// WRONG — business rule embedded in shell
if (periods.length < 1 || periods.length > 31) {
  yield* Effect.fail(new InvalidPeriodCountError({ ... }));
}

// RIGHT — delegate to FC, match on decision
const decision = validationService.decidePlanCreation({ ... });
yield* PlanCreationDecision.$match(decision, {
  CanCreate: () => Effect.void,
  InvalidPeriodCount: ({ periodCount, minPeriods, maxPeriods }) =>
    Effect.fail(new InvalidPeriodCountError({ ... })),
  // ...
});
```

**2. Business logic in handler:**

```typescript
// WRONG — business logic in HTTP layer
.handle('createPlan', ({ payload }) =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser;
    if (payload.periods.length > 31) {  // Business rule in handler!
      yield* Effect.fail(new InvalidPeriodCountErrorSchema({ ... }));
    }
    // ...
  }),
)

// RIGHT — handler only maps errors, service delegates to FC
.handle('createPlan', ({ payload }) =>
  Effect.gen(function* () {
    const currentUser = yield* CurrentUser;
    const plan = yield* planService.createPlan(...).pipe(
      Effect.catchTags({ InvalidPeriodCountError: (e) => Effect.fail(new InvalidPeriodCountErrorSchema({ ... })) }),
    );
    return plan;
  }),
)
```

**3. FC function using Effect.fail (mixing Core with Shell):**

```typescript
// WRONG — Effect.fail in FC (shell concern)
export const validatePlanCreation = (input: PlanCreationInput) =>
  Effect.gen(function* () {
    if (input.activePlanId) {
      yield* Effect.fail(new PlanAlreadyActiveError({ ... }));
    }
  });

// RIGHT — FC returns Decision ADT, shell interprets
export const decidePlanCreation = (input: PlanCreationInput): PlanCreationDecision => {
  if (input.activePlanId) {
    return PlanCreationDecision.BlockedByActivePlan({ userId: input.userId, planId: input.activePlanId });
  }
  return PlanCreationDecision.CanCreate();
};
```

### Boolean vs Decision ADT: Choosing the Right Form

| Possible outcomes        | Pattern                        | Example                                           |
| ------------------------ | ------------------------------ | ------------------------------------------------- |
| **2 (binary pass/fail)** | Pure boolean predicate         | `isPlanInProgress(status): boolean`               |
| **3+**                   | `Data.TaggedEnum` decision ADT | `decidePlanCreation(input): PlanCreationDecision` |

A `CanCreatePlan { CanCreate, Blocked }` Decision ADT with only two variants and no
variant-specific data adds ceremony over a boolean. Use Decision ADTs when all three
conditions are met:

1. The decision has **3+ outcomes**
2. Each outcome drives a **different action** in the consumer
3. The variants carry **different data**

---

## 8. Key Architectural Rules

### 8.1 Clock Rule

| Usage                         | Rule                 | Example                              |
| ----------------------------- | -------------------- | ------------------------------------ |
| `new Date()` (current time)   | **Forbidden**        | Use `DateTime.nowAsDate` in services |
| `new Date(isoString)` (parse) | **Allowed** anywhere | Parsing DB/API dates                 |
| `new Date(timestamp)` (clone) | **Allowed** anywhere | Cloning for immutability             |

For getting the current time:

| Layer               | Can Access Time? | How                               |
| ------------------- | ---------------- | --------------------------------- |
| Handler             | Avoid            | Delegate to service               |
| Application Service | YES              | `yield* DateTime.nowAsDate`       |
| Repository          | Avoid            | Receives time from service        |
| Domain Function     | NEVER            | Receives `now: Date` as parameter |

```typescript
// Application Service — correct clock access
const now = yield * DateTime.nowAsDate;
const decision = cancellationService.decidePlanCancellation({
  planId: plan.id,
  status: plan.status,
  periods: plan.periods,
  now,
});
```

### 8.2 Mandatory DI Consumption

Application services and repositories MUST consume domain services via DI — never import
standalone functions directly. Standalone exports exist for **direct unit testing only**.

```typescript
// ✅ CORRECT: DI via yield*
effect: Effect.gen(function* () {
  const validationService = yield* PlanValidationService;
  const calculationService = yield* PeriodCalculationService;
  // ...
  const decision = validationService.decidePlanCreation(input);
}),
dependencies: [PlanValidationService.Default, PeriodCalculationService.Default],

// ❌ WRONG: Direct import in application service
import { decidePlanCreation } from '../domain/services/plan-validation.service';
const decision = decidePlanCreation(input); // Bypasses DI
```

### 8.3 Error Mapping Pattern

Domain errors (`Data.TaggedError`) are mapped to HTTP schema errors (`S.TaggedError`)
exclusively in the **handler** via `Effect.catchTags`:

```typescript
.pipe(
  Effect.catchTags({
    PlanAlreadyActiveError: (error) =>
      Effect.fail(new PlanAlreadyActiveErrorSchema({ message: error.message, userId })),
    PlanRepositoryError: (error) => handleRepositoryError(error),
  }),
)
```

**Rules:**

- Every domain error the service can produce MUST have a corresponding `catchTags` entry
- Repository errors are sanitized: log cause server-side, return generic message to client
- Schema errors define the status code in the API Group (`addError(..., { status: 409 })`)

### 8.4 Structured Logging

Use `Effect.annotateLogs` to add structured metadata. **Do not use manual prefixes** like
`[ServiceName]`.

| Component    | Key          | Example Value       |
| ------------ | ------------ | ------------------- |
| Handlers     | `handler`    | `'plan.createPlan'` |
| Services     | `service`    | `'PlanService'`     |
| Repositories | `repository` | `'PlanRepository'`  |
| Middleware   | `middleware` | `'Authentication'`  |
| Utilities    | `util`       | `'getClientIp'`     |

```typescript
// Service method — annotate at the end
createPlan: (...) =>
  Effect.gen(function* () {
    yield* Effect.logInfo('Creating new plan');
    // ...
  }).pipe(Effect.annotateLogs({ service: 'PlanService' })),

// Output format
// timestamp=2025-01-01T00:00:00.000Z level=INFO message="Creating new plan" service=PlanService
```

### 8.5 Repository Validates Output

The repository **trusts input** from the application service (already validated by FC) and
**validates output** from the database (could return unexpected data).

```typescript
// ✅ Trust input — no need to re-validate periods from service
yield* drizzle.insert(periodsTable).values(periodData);

// ✅ Validate output — DB could return unexpected data
const results = yield* drizzle.select().from(plansTable).where(eq(plansTable.id, planId));
if (results.length === 0) {
  return yield* Effect.fail(new PlanNotFoundError({ ... }));
}
```

### 8.6 Import Rules (Circular Dependency Prevention)

Feature barrels (`features/{feature}/index.ts`) MUST NOT re-export `./api`.
Handlers are leaf nodes — only `api.ts` imports them.

```typescript
// features/plan/index.ts — CORRECT
export * from './domain';
export * from './repositories';
export * from './services';
// Note: NO re-export of './api'

// Cross-feature imports MUST target a specific sublayer:
import { PlanWithPeriods, PlanName } from '../../plan/domain';       // ✅ types
import { PlanRepository } from '../../plan/repositories';             // ✅ data access
import { PlanService } from '../../plan/services';                    // ✅ app service
import { ... } from '../../plan';                                     // ❌ feature barrel (risk of cycles)
```

### 8.7 Authentication Pattern

Authentication is handled by middleware that provides a `CurrentUser` context tag.
Endpoints opt in via `.middleware(Authentication)` in the API Group.

```typescript
// In handler — extract authenticated user
const currentUser = yield * CurrentUser;
const userId = currentUser.userId;

// Middleware verifies JWT → validates against cache → provides CurrentUser
// Fail-closed: if cache validation fails, token is rejected
```

**Rules:**

- All mutating endpoints require `Authentication` middleware
- `CurrentUser` provides `userId` and `email`
- Token invalidation on password change via `UserAuthCache`
- Repository methods always receive `userId` for row-level access control

### 8.8 Cross-Feature Service Delegation

When a feature needs to perform an operation owned by another feature (e.g., plan-template
needs to create a plan), it **delegates to the owning feature's Application Service** via DI.
This ensures domain rules are never duplicated across features.

**Canonical example:** `PlanTemplateService.applyPlanTemplate` → `PlanService.createPlan`

```typescript
// plan-template/services/plan-template.service.ts
export class PlanTemplateService extends Effect.Service<PlanTemplateService>()('PlanTemplateService', {
  effect: Effect.gen(function* () {
    const planService = yield* PlanService;          // Cross-feature DI
    const templateRepository = yield* PlanTemplateRepository;
    const domainService = yield* PlanTemplateDomainService;

    return {
      applyPlanTemplate: (userId, planTemplateId, startDate) =>
        Effect.gen(function* () {
          // Template-specific logic (own domain)
          const template = yield* templateRepository.getPlanTemplateWithPeriods(userId, planTemplateId);
          // ...
          const periodInputs = domainService.toPeriodInputs(periodConfigs);

          // Delegate to PlanService — plan-domain rules (active plan, cycle conflicts) evaluated there
          const plan = yield* planService.createPlan(userId, startDate, periodInputs, template.name);

          // Side-effects after delegation (non-critical, errors swallowed)
          yield* templateRepository.touchLastUsedAt(userId, planTemplateId, now).pipe(
            Effect.catchTag('PlanTemplateRepositoryError', () => Effect.void),
          );

          return plan;
        }),
    };
  }),
  dependencies: [PlanTemplateRepository.Default, PlanTemplateDomainService.Default, PlanService.Default],
});
```

**Rules:**

1. **Import the Application Service** (not the Repository or domain service) of the other feature
2. **Error channel is a union** of both features' errors — the handler must map all of them:

```typescript
// Error union in the delegating service's return type:
Effect<
  PlanWithPeriods,
  | PlanTemplateNotFoundError // Template feature errors
  | PlanTemplateRepositoryError // Template feature errors
  | PlanAlreadyActiveError // Plan feature errors (from delegation)
  | ActiveCycleExistsError // Plan feature errors (from delegation)
  | PeriodOverlapWithCycleError // Plan feature errors (from delegation)
  | PlanRepositoryError // Plan feature errors (from delegation)
>;
```

3. **Handler maps both features' errors:**

```typescript
// plan-template-api-handler.ts
.pipe(
  Effect.catchTags({
    // Own feature errors
    PlanTemplateNotFoundError: (e) => Effect.fail(new PlanTemplateNotFoundErrorSchema({ ... })),
    PlanTemplateRepositoryError: (e) => handleTemplateRepositoryError(e),

    // Delegated feature errors (Plan)
    PlanAlreadyActiveError: (e) => Effect.fail(new PlanAlreadyActiveErrorSchema({ ... })),
    ActiveCycleExistsError: (e) => Effect.fail(new ActiveCycleExistsErrorSchema({ ... })),
    PlanRepositoryError: (e) => handlePlanRepositoryError(e),
  }),
)
```

4. **Unreachable errors from delegation** are caught with `Effect.die` (defensive guard):

```typescript
// InvalidPeriodCountError should never occur with valid template data
.pipe(Effect.catchTag('InvalidPeriodCountError', (e) =>
  Effect.die(`Unexpected InvalidPeriodCountError from valid template: ${e.message}`),
))
```

5. **Data transformation between features** happens via FC functions (e.g., `toPeriodInputs`
   converts `TemplatePeriodConfig[]` → plain period inputs compatible with `PlanService`).
   This is a boundary mapper between feature domains.

6. **Cross-feature imports target specific sublayers** (enforced by import rules §8.6):

```typescript
import { PlanService } from '../../plan/services'; // ✅ Application service
import type { PlanWithPeriods } from '../../plan/domain'; // ✅ Domain types
import { PlanAlreadyActiveError } from '../../plan/domain'; // ✅ Domain errors
import { PlanRepositoryError } from '../../plan/repositories'; // ✅ Repository errors
```

---

## 9. Directory Structure Reference

```
api/src/features/{feature}/
  |
  |-- api/
  |   |-- {feature}-api.ts               # API endpoint definitions (HttpApiGroup)
  |   |-- {feature}-api-handler.ts        # Handler implementations (HttpApiBuilder.group)
  |   |-- schemas/
  |   |   |-- requests.ts                 # Request schemas (S.Class, auto-validated)
  |   |   |-- errors.ts                   # Error schemas (S.TaggedError, HTTP responses)
  |   |   |-- responses.ts                # Response schemas (re-exports from @ketone/shared)
  |   |   +-- index.ts                    # Barrel re-exports
  |   +-- __tests__/                      # Integration tests
  |
  |-- domain/
  |   |-- {feature}.model.ts              # Constants, branded types, VOs, entities, domain-state ADTs
  |   |-- errors.ts                       # Domain errors (Data.TaggedError)
  |   |-- functional-domain-design.md     # Feature-specific FC/IS design doc
  |   |-- index.ts                        # Barrel: model + errors + contracts + services
  |   |
  |   |-- contracts/
  |   |   |-- {use-case}.ts               # Input + Decision ADT (one per mutation)
  |   |   +-- index.ts
  |   |
  |   +-- services/
  |       |-- {name}-validation.service.ts # Pure validation functions + Service Adapter
  |       |-- {name}-calculation.service.ts# Pure date/math functions + Service Adapter
  |       +-- index.ts
  |
  |-- repositories/
  |   |-- {feature}.repository.postgres.ts # PostgreSQL implementation (Drizzle ORM)
  |   |-- {feature}.repository.interface.ts# Interface definition (for testing)
  |   |-- schemas.ts                       # DB output record schemas
  |   |-- errors.ts                        # Repository errors (Data.TaggedError)
  |   +-- index.ts
  |
  |-- services/
  |   +-- {feature}.service.ts             # Application service (Three Phases coordinator)
  |
  +-- index.ts                             # Feature barrel (domain + repositories + services, NOT api)
```

**Plan feature (reference):**

```
api/src/features/plan/
  +-- api/
  |   +-- plan-api.ts                     # 8 endpoints (CRUD + cancel + complete + updatePeriods + updateMetadata)
  |   +-- plan-api-handler.ts             # All 8 handlers with error mapping
  |   +-- schemas/
  |       +-- requests.ts                 # CreatePlan, UpdatePeriods, UpdatePlanMetadata
  |       +-- errors.ts                   # 10 error schemas
  |       +-- responses.ts                # Re-exports from @ketone/shared
  +-- domain/
  |   +-- plan.model.ts                   # 8 constants, 7 branded types, 3 VOs, 3 entities, 3 tagged enums
  |   +-- errors.ts                       # 10 domain errors
  |   +-- contracts/
  |   |   +-- plan-creation.ts            # PlanCreationInput + PlanCreationDecision (4 variants)
  |   |   +-- plan-cancellation.ts        # PlanCancellationInput + PlanCancellationDecision (2 variants)
  |   |   +-- plan-completion.ts          # PlanCompletionInput + PlanCompletionDecision (3 variants)
  |   |   +-- period-update.ts            # PeriodUpdateInput + PeriodUpdateDecision (4 variants)
  |   +-- services/
  |       +-- plan-validation.service.ts  # isPlanInProgress, decidePlanCreation
  |       +-- period-calculation.service.ts# calculatePeriodDates, computeRecalculatedPeriods
  |       +-- plan-cancellation.service.ts# classifyPeriod, decidePlanCancellation
  |       +-- plan-completion.service.ts  # decidePlanCompletion
  |       +-- period-update.service.ts    # decidePeriodUpdate
  |       +-- plan-metadata.service.ts    # computeMetadataUpdate
  +-- repositories/
  |   +-- plan.repository.postgres.ts     # 13 methods (CRUD + cancel + complete + periods + metadata)
  |   +-- plan.repository.interface.ts    # IPlanRepository interface
  |   +-- errors.ts                       # PlanRepositoryError
  +-- services/
  |   +-- plan.service.ts                 # 7 methods (createPlan, cancelPlan, completePlan, etc.)
  +-- index.ts                            # Barrel: domain + repositories + services
```

---

## 10. Architecture Phases (dm-design Alignment)

Implementation of a new feature proceeds in **4 phases**, each building on the previous.
This aligns with the `dm-design` skill's implementation protocol. Each phase has a clear
set of artifacts, and no phase should begin until its predecessor is complete.

```
Phase 1 (Core)     ──────────────────────────────────►
                   Types, Errors, Contracts, Pure Services

Phase 2 (API)      ──────────────────────────────────►
                   Schemas, Handlers (depends on Core types)

Phase 3 (Repo)     ──────────────────────────────────►
                   Repository (depends on Core types)

Phase 4 (Coord)    ──────────────────────────────────►
                   App Service (depends on Core + API + Repo)
```

### Phase 1: Functional Core (Pure Logic)

> Domain types, pure services, ADTs, contracts, reified decisions

Steps MUST follow this order (dependencies flow top-to-bottom):

| Step | Component                 | Skill                          | File                                           | Notes                                                             |
| ---- | ------------------------- | ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------- |
| 1.a  | Constants + Branded Types | `dm-create-branded-type`       | `domain/{module}.model.ts`                     | Define named constants FIRST, then branded types referencing them |
| 1.b  | Value Objects             | `dm-create-value-object`       | `domain/{module}.model.ts`                     | Depend on branded types                                           |
| 1.c  | Tagged Enums              | `dm-create-tagged-enum`        | `domain/{module}.model.ts`                     | ADTs for decisions and domain-state classifications               |
| 1.d  | Smart Constructors        | `dm-create-smart-constructors` | `domain/{module}.model.ts`                     | For types with cross-field validation                             |
| 1.e  | Domain Errors             | `dm-create-domain-error`       | `domain/errors.ts`                             | Typed errors for business rule violations                         |
| 1.f  | Contracts                 | `dm-create-contract`           | `domain/contracts/{use-case}.ts`               | Use-case Input + Decision ADT (one per mutation)                  |
| 1.g  | Validation Services       | `dm-create-validation-service` | `domain/services/{name}-validation.service.ts` | Pure business rules                                               |
| 1.h  | Domain Services           | `dm-create-domain-service`     | `domain/services/{name}.service.ts`            | Pure logic + Effect.Service adapter                               |

**Plan feature example:** 8 constants → 7 branded types → 3 VOs → 3 entities → 3 tagged enums → 10 errors → 4 contracts → 6 domain services

**Phase 1 checklist:**

- [ ] All constants named (no magic numbers)
- [ ] Branded types reference constants in predicates and error messages
- [ ] Every mutating use-case has a contract with Decision ADT
- [ ] Domain functions are pure (zero I/O) with FC header
- [ ] Dual export: standalone functions + Effect.Service wrapper

### Phase 2: Shell APIs (HTTP Layer)

> Request/Response/Error schemas, endpoint definitions, handlers

| Step | Component        | File                           | Notes                                       |
| ---- | ---------------- | ------------------------------ | ------------------------------------------- |
| 2.a  | Request Schemas  | `api/schemas/requests.ts`      | Input validation + transformation           |
| 2.b  | Response Schemas | `api/schemas/responses.ts`     | Output shape (often re-exports from shared) |
| 2.c  | Error Schemas    | `api/schemas/errors.ts`        | HTTP error schemas (`S.TaggedError`)        |
| 2.d  | API Group        | `api/{feature}-api.ts`         | Endpoint definitions, middleware attachment |
| 2.e  | Handler          | `api/{feature}-api-handler.ts` | Error mapping with `Effect.catchTags`       |

**Phase 2 checklist:**

- [ ] Request schemas validate and transform input before handler
- [ ] Error schemas have correct HTTP status codes
- [ ] Handler maps **every** domain error to HTTP schema error
- [ ] Repository errors sanitized (log cause, generic message)

### Phase 3: Persistence Layer (Repository)

> Database access, output validation, record schemas

| Step | Component            | File                                             | Notes                        |
| ---- | -------------------- | ------------------------------------------------ | ---------------------------- |
| 3.a  | Record Schemas       | `repositories/schemas.ts`                        | DB output validation schemas |
| 3.b  | Repository Interface | `repositories/{feature}.repository.interface.ts` | Interface for testing        |
| 3.c  | Repository Impl      | `repositories/{feature}.repository.postgres.ts`  | Drizzle ORM + Effect         |

**Phase 3 checklist:**

- [ ] Trust input from service (no re-validation)
- [ ] Validate output from DB
- [ ] Concurrency guards on mutations (`WHERE status = ...`)
- [ ] DB constraint violations mapped to domain errors

### Phase 4: Coordinator Layer (Application Service)

> Three Phases composition, DI wiring, orchestration

| Step | Component           | Skill                            | File                            | Notes                                                                    |
| ---- | ------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| 4.a  | Application Service | `dm-create-functional-core-flow` | `services/{feature}.service.ts` | Three Phases: Collection → Logic → Persistence. Orchestrates Core + Repo |

**Phase 4 checklist:**

- [ ] Every mutating method documents its Three Phases in comments
- [ ] FC decision functions called in Logic phase (no inline rules)
- [ ] Decision ADTs matched with `$match` for branching persistence
- [ ] All dependencies injected via `yield*`
- [ ] `dependencies` array lists all `.Default` layers
- [ ] Clock access via `DateTime.nowAsDate`

---

## 11. Decision Flowchart: Where Does This Logic Go?

```
START: "I need to write some logic..."
  |
  |-- Does it involve HTTP concerns (request parsing, status codes, auth context)?
  |     YES --> Handler (api/{feature}-api-handler.ts)
  |
  |-- Does it involve database access (SQL, Drizzle, transactions)?
  |     YES --> Is it a concurrency guard or constraint mapping?
  |               YES --> Repository (repositories/{feature}.repository.ts)
  |               NO  --> Is it output validation from DB?
  |                         YES --> Repository
  |                         NO  --> Re-examine: extract query to repository,
  |                                 keep logic in service
  |
  |-- Does it coordinate Collection → Logic → Persistence?
  |     YES --> Application Service (services/{feature}.service.ts)
  |
  |-- Is it a business rule or domain calculation?
  |     YES --> Can it be a pure function (no I/O, deterministic)?
  |               YES --> Domain Function (domain/services/)
  |               NO  --> Re-examine: extract the pure part to FC,
  |                       keep I/O in Application Service
  |
  |-- Does it map domain errors to HTTP response errors?
  |     YES --> Handler (via Effect.catchTags)
  |
  |-- Does it need the current time for a business decision?
  |     YES --> Application Service gets time (DateTime.nowAsDate),
  |             passes it as parameter to FC function
  |
  |-- None of the above?
  |     --> Re-examine: you may be conflating concerns.
  |         Split it into a pure part (FC) and an I/O part (Shell).
```

---

## 12. Glossary

| Term                  | Definition                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FC**                | Functional Core. Pure functions with no I/O, no state, no framework coupling. The `domain/` folder hosts FC plus boundary artifacts (contracts). |
| **IS**                | Imperative Shell. Everything outside the FC that orchestrates I/O and state.                                                                     |
| **Shell**             | Synonym for IS. In the API: Handler, Application Service, Repository.                                                                            |
| **Three Phases**      | Application Service pattern: Collection → Logic → Persistence.                                                                                   |
| **Contract**          | Interface defining what a use-case operation needs (Input) and decides (Decision ADT). Uses domain-typed fields. One per mutation.               |
| **Decision ADT**      | A `Data.TaggedEnum` that reifies a use-case decision as data. Lives in contracts alongside its Input.                                            |
| **Branded Type**      | A primitive refined with domain constraints via `Brand.refined` (e.g., `FastingDuration`).                                                       |
| **Value Object**      | An `S.Class` with multiple fields, no identity. Compared by value.                                                                               |
| **Entity**            | An `S.Class` with identity (`id` field) and lifecycle (e.g., `Plan`, `Period`).                                                                  |
| **Smart Constructor** | A function that parses unknown values into branded/VO types, returning `Effect` or `Option`.                                                     |
| **Request Schema**    | Effect Schema class that auto-validates incoming JSON. API equivalent of the web's Input Validation.                                             |
| **Schema Error**      | `S.TaggedError` that defines the wire format of HTTP error responses.                                                                            |
| **Domain Error**      | `Data.TaggedError` that represents in-memory business failures.                                                                                  |
| **Repository Error**  | `Data.TaggedError` for database operation failures. Cause is logged, sanitized message sent to client.                                           |
| **Clock Rule**        | Shell uses `DateTime.nowAsDate`; FC receives `now: Date` as param. `new Date(value)` for parsing/cloning is fine.                                |
| **Concurrency Guard** | A `WHERE status = 'InProgress'` clause in repository mutations that prevents race conditions.                                                    |
| **Boundary Mapper**   | A function that converts between DB record format and domain types (in repository).                                                              |
| **Domain Function**   | Standalone pure function in `domain/services/`. The primary FC export. In API: consumed via DI only (standalone for testing).                    |
| **Service Adapter**   | `Effect.Service` wrapper that re-exports domain functions for DI in Application Services and Repositories. Secondary, adds no logic.             |
| **Error Mapping**     | The `Effect.catchTags` pattern in handlers that converts domain errors to HTTP schema errors.                                                    |
| **Feature Barrel**    | `index.ts` that re-exports domain, repositories, and services. Never re-exports `./api` (to prevent circular deps).                              |

---

## 13. FC/IS Compliance Checklist

Use this checklist when reviewing a feature for FC/IS compliance.

### Domain Layer (Functional Core)

- [ ] All domain constants are **named** (no magic numbers in predicates or error messages)
- [ ] Branded types reference constants in predicates and error messages
- [ ] Value Objects use `S.Class`, compared by value
- [ ] Entities use `S.Class` with branded ID fields
- [ ] Use-case Decision ADTs live in **contracts** alongside their Input (`Data.TaggedEnum` + `$match`)
- [ ] Domain-state ADTs (reusable across contexts) live in **models**
- [ ] Smart constructors return `Effect` (effectful) or `Option` (synchronous)
- [ ] Every mutating use-case has a **contract** in `domain/contracts/`
- [ ] Contract inputs use `S.Struct` with branded types (not `interface`)
- [ ] Domain function files have the **mandatory FC header** with Three Phases context
- [ ] **Domain functions** are standalone pure functions (primary export, no Effect dependency)
- [ ] **Service adapter** wraps domain functions in `Effect.Service` for DI
- [ ] Domain functions contain **zero I/O** — no HTTP, no clock, no randomness, no `Effect.fail`
- [ ] Domain errors use `Data.TaggedError`
- [ ] FC preconditions use boolean predicates (2 outcomes) or Decision ADTs (3+ outcomes) — never `Effect<void, Error>`

### Request Schemas (Input Validation)

- [ ] Request schemas use `S.Class` with validation pipes (`S.minLength`, `S.maxLength`, etc.)
- [ ] Error messages use lazy evaluation: `{ message: () => '...' }`
- [ ] Shared schemas from `@ketone/shared` are reused (not duplicated)
- [ ] `S.Date` used for ISO string → Date transformation
- [ ] `S.optional(...)` used for optional fields

### API Group (Endpoint Definitions)

- [ ] All endpoints declare their request/response/error schemas
- [ ] Error schemas have correct HTTP status codes (`409` conflict, `422` validation, `404` not found, `500` internal)
- [ ] Path params use branded types where possible (`PlanId` instead of `S.UUID`)
- [ ] `Authentication` middleware attached to protected endpoints

### Handler

- [ ] Extracts `CurrentUser` from middleware
- [ ] Logs incoming request
- [ ] Calls application service (not repository directly)
- [ ] Maps **every** domain error to HTTP schema error via `Effect.catchTags`
- [ ] Repository errors are sanitized (log cause, return generic message)
- [ ] Uses `Effect.annotateLogs({ handler: '...' })`
- [ ] Contains **zero business logic** — only error mapping and input normalization

### Application Service (Three Phases)

- [ ] Every mutating method documents its **Three Phases** in comments
- [ ] FC decision functions called in **Logic phase** (not inline rules)
- [ ] Decision ADTs matched with `$match` for branching persistence
- [ ] Dependencies injected via `yield*` (never direct function imports)
- [ ] `dependencies` array includes all domain service `.Default` layers
- [ ] Clock access via `DateTime.nowAsDate` (never `new Date()`)
- [ ] Error logging via `Effect.tapError`
- [ ] Uses `Effect.annotateLogs({ service: '...' })`
- [ ] Returns domain errors (`Data.TaggedError`) — not schema errors

### Repository

- [ ] **Trusts input** from service (no re-validation of domain types)
- [ ] **Validates output** from database (check result exists, map types)
- [ ] Maps DB constraint violations to domain errors (unique index → specific error)
- [ ] Concurrency guards on mutations (`WHERE status = 'InProgress'`)
- [ ] Uses `Effect.annotateLogs({ repository: '...' })`
- [ ] Returns domain types (entities, value objects) — not raw DB records to service

### Cross-Cutting

- [ ] No `new Date()` for current time (use `DateTime.nowAsDate` in services)
- [ ] Feature barrel does NOT re-export `./api`
- [ ] Cross-feature imports target specific sublayers (`../../plan/domain`, not `../../plan`)
- [ ] All error handling uses typed `Data.TaggedError`, not string matching
- [ ] Feature has a `domain/functional-domain-design.md`
- [ ] `Match.exhaustive` for closed Decision ADTs; `Match.orElse` allowed for open error unions

### dm-design Alignment (Architecture Phases)

- [ ] Architecture Phases 1–4 completed in order (Core → API → Repo → Coordinator)
- [ ] All Phase 1 artifacts present: constants, branded types, VOs, entities, errors, contracts, domain services
- [ ] All Phase 2 artifacts present: request/response/error schemas, API group, handler
- [ ] All Phase 3 artifacts present: record schemas, repository interface, repository implementation
- [ ] All Phase 4 artifacts present: application service with Three Phases
- [ ] 4 Validation Layers covered: Input Schema, Domain Validation, Service Coordination, Repository Output
- [ ] Data Seams identified: HTTP → Handler → Service → FC → Repository → DB → Response
- [ ] Cross-feature delegation (if applicable) uses Application Service DI, not direct repository access
- [ ] Cross-feature error unions fully mapped in handler
