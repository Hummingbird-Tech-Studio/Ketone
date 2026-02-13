# Web FC/IS Architecture

> Cross-cutting architecture overview for the Ketone web package.
> Feature-specific designs live in each feature's `domain/functional-domain-design.md`.
> Reference implementation: `web/src/views/planTemplates/`.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Layer (Functional Core)](#2-domain-layer-functional-core)
3. [Shell Layers Breakdown](#3-shell-layers-breakdown)
4. [Complete Data Flow Diagrams](#4-complete-data-flow-diagrams)
5. [Responsibility Matrix](#5-responsibility-matrix)
6. [API - Web Analogy Table](#6-api--web-analogy-table)
7. [The FC Delegation Rule](#7-the-fc-delegation-rule)
8. [Key Architectural Rules](#8-key-architectural-rules)
9. [Directory Structure Reference](#9-directory-structure-reference)
10. [Decision Flowchart: Where Does This Logic Go?](#10-decision-flowchart-where-does-this-logic-go)
11. [Glossary](#11-glossary)
12. [FC/IS Compliance Checklist](#12-fcis-compliance-checklist)

---

## 1. Architecture Overview

### The Two-Shell Pattern

Unlike a backend (one shell wrapping the core), the web has **two shells** flanking a central
Functional Core. Each shell handles different I/O concerns:

- **External Shell (API-side)**: communicates with the backend API over HTTP
- **Internal Shell (UI-side)**: communicates with the Vue framework and the user

```
    EXTERNAL SHELL (API-side)                INTERNAL SHELL (UI-side)

  +-------------------------+              +--------------------------+
  |   API Client Service    |              |       Component          |
  |       (Gateway)         |              |      (.vue files)         |
  +-----------+-------------+              +------------+-------------+
              |                                         |
              v                                         v
  +-------------------------+              +--------------------------+
  |  Application Service    |<-------------|      Composable          |
  |   (Three Phases)        |  Actor calls |     (View Model)         |
  +-----------+-------------+  programs    +------------+-------------+
              |                                         |
              v                                         v
       +============+                      +--------------------------+
       ||          ||<---------------------+         Actor            |
       ||    FC    ||  guards, decisions   |    (State Machine)       |
       ||          ||                      +--------------------------+
       +============+
```

### Why Two Shells?

| Concern      | External Shell                     | Internal Shell               |
| ------------ | ---------------------------------- | ---------------------------- |
| I/O type     | HTTP requests to backend API       | Reactive Vue bindings to DOM |
| State format | Effect programs, domain errors     | XState states, Vue refs      |
| Error shape  | `Data.TaggedError` domain errors   | User-facing toast messages   |
| Boundary     | DTO (wire format) <-> Domain types | Domain types <-> UI strings  |

The FC sits in the middle with **zero I/O, zero state, zero framework coupling**. Both shells
orchestrate it. This separation keeps each layer testable in isolation.

---

## 2. Domain Layer (Functional Core)

### 2.1 Directory Layout

```
views/{feature}/domain/
  +-- {feature}.model.ts       Constants, branded types, VOs, ADTs, smart constructors
  +-- errors.ts                Domain errors (Data.TaggedError)
  +-- contracts/               Use-case input interfaces (one per mutation)
  +-- schemas/                 Raw input -> domain type transformers (one per form)
  +-- services/                Pure functions (validation, calculation, decisions)
  +-- index.ts                 Barrel re-exports
```

### 2.2 Contract vs Schema vs Model

These three artifacts cause the most confusion. Here is how they differ:

```
  User types        Schema validates       Contract defines       Model represents
  in a form  ---->  and transforms   ---->  what the use-case ---> the domain
  (raw strings)     to domain types         needs to execute       entities
```

| Aspect            | Model                                        | Contract                                    | Schema                                             |
| ----------------- | -------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| **Purpose**       | "What IS"                                    | "What an operation NEEDS"                   | "How to transform UI -> Domain"                    |
| **Defines**       | Branded types, VOs, ADTs, smart constructors | Use-case input interface with branded types | Validation + transformation from raw to branded    |
| **Used by**       | All layers                                   | Application Service (Three Phases)          | Composable (before sending to actor)               |
| **Changes when**  | Business concepts change                     | Use-case requirements change                | Form/UI changes                                    |
| **Contains I/O?** | Never                                        | Never                                       | Never                                              |
| **Example**       | `PlanDetail`, `SaveTimelineDecision`         | `CreatePlanInput { name: PlanName }`        | `validateCreatePlanInput(raw) -> Either<PlanName>` |

Key distinction: **Schema** is the bridge between raw UI data and the **Contract**.
The **Contract** is the bridge between the composable/actor and the Application Service.
The **Model** defines the domain vocabulary that both Contract and Schema use.

### 2.3 Models -- Branded Types, Value Objects, ADTs

The model file (`{feature}.model.ts`) is the domain vocabulary. It contains:

**Constants** -- Named limits, never magic numbers:

```typescript
export const MIN_PLAN_NAME_LENGTH = 1;
export const MAX_PLAN_NAME_LENGTH = 100;
```

**Branded Types** -- Primitives with domain constraints:

```typescript
export type PlanName = string & Brand.Brand<'PlanName'>;
export const PlanName = Brand.refined<PlanName>(
  (s) => s.length >= MIN_PLAN_NAME_LENGTH && s.length <= MAX_PLAN_NAME_LENGTH,
  (s) => Brand.error(`Expected plan name between ${MIN_PLAN_NAME_LENGTH}-${MAX_PLAN_NAME_LENGTH} chars`),
);
```

**Value Objects** -- Multiple fields that always travel together (via `S.Class`):

```typescript
export class PlanPeriodConfig extends S.Class<PlanPeriodConfig>('PlanPeriodConfig')({
  order: PeriodOrderSchema,
  fastingDuration: FastingDurationSchema,
  eatingWindow: EatingWindowSchema,
}) {}
```

**Decision ADTs** -- Reified business decisions with variant-specific data:

```typescript
export type SaveTimelineDecision = Data.TaggedEnum<{
  NoChanges: {};
  OnlyStartDate: { readonly startDate: Date };
  OnlyPeriods: { readonly periods: ReadonlyArray<PlanPeriodUpdate> };
  StartDateAndPeriods: { readonly startDate: Date; readonly periods: ReadonlyArray<PlanPeriodUpdate> };
}>;
export const SaveTimelineDecision = Data.taggedEnum<SaveTimelineDecision>();
export const { $match: matchSaveTimelineDecision } = SaveTimelineDecision;
```

**Smart Constructors** -- Parse unknown values into branded types:

```typescript
export const createPlanId = (value: unknown): Effect.Effect<PlanId, ParseResult.ParseError> =>
  S.decodeUnknown(PlanId)(value);
export const makePlanId = (value: unknown): Option.Option<PlanId> => Effect.runSync(Effect.option(createPlanId(value)));
```

#### Type Decision Flowchart

```
Is it a single primitive with constraints?      --> Brand.refined
Is it multiple fields that always go together?  --> S.Class (Value Object)
Are all variants the same shape?                --> S.Literal union (enum)
Do variants carry different data?               --> Data.TaggedEnum (ADT)
Does it need identity and lifecycle?            --> S.Class (Entity)
```

### 2.4 Contracts -- Use-Case Interfaces

A contract defines **what a mutation needs** using already-branded domain types.
One contract per mutating use case.

```typescript
// domain/contracts/create-plan.contract.ts
export interface CreatePlanInput {
  name: PlanName;
  description: PlanDescription | null;
  startDate: Date;
  periods: ReadonlyArray<PlanPeriodConfig>;
}
```

**When to create a contract:**

- Every mutating operation (create, update, delete, cancel, complete) gets one
- Read-only operations (get, list) typically don't need one
- If the contract includes context the actor merges in (e.g. `currentCount`), document it

Contracts may include fields the UI does NOT provide -- the actor merges them from context:

```typescript
// Contract needs currentCount (from actor context, not from UI)
export interface CreateFromPlanInput {
  planId: string;
  currentCount: number; // Merged by actor
  maxTemplates: number; // Merged by actor
}
```

### 2.5 Schemas -- Input Validation and Transformation

Each form gets an input schema that follows a 4-part pattern:

```
1. Raw Input type        - Untyped form values (string, number)
2. Domain Input type     - Type alias to the contract input
3. Validation function   - Transforms raw -> domain, returns Either
4. Error extraction      - ParseError -> Record<string, string[]>
```

```typescript
// domain/schemas/create-plan-input.schema.ts
export type CreatePlanRawInput = { name: string; description: string /* ... */ };
export type CreatePlanDomainInput = CreatePlanInput;

export const validateCreatePlanInput = (
  raw: CreatePlanRawInput,
): Either.Either<CreatePlanDomainInput, ParseResult.ParseError> => S.decodeUnknownEither(CreatePlanInputSchema)(raw);

export const extractSchemaErrors = (
  result: Either.Either<unknown, ParseResult.ParseError>,
): Record<string, string[]> => {
  /* ... */
};
```

The schema **transforms** raw UI values into branded domain types:

- `"My Plan"` -> `PlanName("My Plan")` (validated)
- `""` (empty description) -> `null`
- `[{ fasting: 16, eating: 8 }]` -> `[PlanPeriodConfig({ order: PeriodOrder(1), ... })]`

### 2.6 Services -- Pure Functions

FC services contain **pure functions** with no I/O, no Effect error signaling, and deterministic
results. They are the "Core" in Functional Core / Imperative Shell.

**Two categories:**

| Category            | Purpose                              | Example                                                    |
| ------------------- | ------------------------------------ | ---------------------------------------------------------- |
| Validation Service  | Boolean predicates and Decision ADTs | `decideSaveTimeline()`, `isTemplateLimitReached()`         |
| Calculation Service | Date math, period generation         | `computeNextContiguousPeriod()`, `shiftPeriodStartTimes()` |

**Mandatory FC header** -- every service file must include:

```typescript
/**
 * FUNCTIONAL CORE -- Plan Validation Service
 *
 * Pure validation functions (no I/O, no Effect error signaling, deterministic).
 *
 * Three Phases usage (in PlanApplicationService.saveTimeline):
 *   1. COLLECTION (Shell -- Gateway): Load original plan from actor context
 *   2. LOGIC (Core):                  decideSaveTimeline compares original vs current
 *   3. PERSISTENCE (Shell -- Gateway): Update metadata and/or periods based on decision
 */
```

**Dual export pattern** -- standalone functions AND Effect.Service wrapper:

```typescript
// Standalone (direct use in composable computeds, tests)
export const isValidStartDate = (startDate: Date, lastCycleEndDate: Date | null): boolean =>
  lastCycleEndDate === null || startDate.getTime() >= lastCycleEndDate.getTime();

// Effect.Service wrapper (dependency injection in Application Service)
export class PlanValidationService extends Effect.Service<PlanValidationService>()('PlanValidationService', {
  succeed: { isValidStartDate, decideSaveTimeline /* ... */ },
  accessors: true,
}) {}
```

### 2.7 Errors -- Data.TaggedError vs S.TaggedError

| Error Kind   | Mechanism          | Location           | Purpose                          |
| ------------ | ------------------ | ------------------ | -------------------------------- |
| Domain Error | `Data.TaggedError` | `domain/errors.ts` | In-memory business failures      |
| Schema Error | `S.TaggedError`    | API schemas        | Wire-format HTTP response errors |

```typescript
// Domain error (used in gateway + application service)
export class PlanNotFoundError extends Data.TaggedError('PlanNotFoundError')<{
  planId: string;
}> {}

// Schema error (used in API handlers for HTTP responses)
export class PlanNotFoundErrorSchema extends S.TaggedError<PlanNotFoundErrorSchema>()('PlanNotFoundError', {
  message: S.String,
}) {}
```

In the web package, only `Data.TaggedError` is used. `S.TaggedError` lives on the API side.

---

## 3. Shell Layers Breakdown

### 3.1 API Client Service (Gateway)

**File:** `services/{feature}-api-client.service.ts`

The web equivalent of the API's Repository layer. Handles all HTTP communication and
DTO <-> Domain boundary mapping.

**Responsibility:**

- Make HTTP requests via `AuthenticatedHttpClient`
- Apply **boundary mappers** to transform DTOs to domain types (and vice versa)
- Map HTTP errors to domain errors using `Match.value` patterns
- Return only domain types -- never raw DTOs

**Legitimate logic:**

- `fromPlanResponse(dto)` -> `PlanDetail` (boundary mapper, decode direction)
- `toCreatePlanPayload(input)` -> API payload (boundary mapper, encode direction)
- HTTP status code -> domain error mapping

**Anti-patterns:**

- Business validation (belongs in FC service)
- Caching or retry logic (belongs in HTTP layer)
- Formatting for display (belongs in composable)

**Structure:**

```typescript
export class PlanApiClientService extends Effect.Service<PlanApiClientService>()(
  'PlanApiClientService',
  {
    effect: Effect.gen(function* () {
      const authenticatedClient = yield* AuthenticatedHttpClient;
      return {
        getActivePlan: (): Effect.Effect<PlanDetail, GetActivePlanError> => /* ... */,
        createPlan: (input: CreatePlanInput): Effect.Effect<PlanDetail, CreatePlanError> => /* ... */,
      };
    }),
    dependencies: [AuthenticatedHttpClient.Default],
    accessors: true,
  },
) {}
```

### 3.2 Application Service (Three Phases)

**File:** `services/{feature}-application.service.ts`

The orchestration layer that sits between XState actors and the API client + FC services.
Follows the Three Phases pattern.

**The Three Phases:**

```
  Phase 1: COLLECTION          Phase 2: LOGIC             Phase 3: PERSISTENCE
  (Shell -- Gateway)           (Core -- FC Service)       (Shell -- Gateway)
  +-------------------+        +-------------------+      +-------------------+
  | Fetch data from   | -----> | Pure decision     | ---> | Write to API      |
  | API or caller     |        | function returns  |      | based on the      |
  | input             |        | Decision ADT      |      | decision variant  |
  +-------------------+        +-------------------+      +-------------------+
```

**Responsibility:**

- Coordinate Collection -> Logic -> Persistence
- Compose API Client + FC services
- Export `program*` helpers as single entrypoint for actors

**Legitimate logic:**

- Calling FC decision functions and branching on ADT variants
- Sequencing multiple gateway calls (e.g. update metadata THEN periods)
- Pass-through delegation for simple operations

**Anti-patterns:**

- Direct HTTP calls (belongs in gateway)
- Business rules (belongs in FC)
- UI formatting (belongs in composable)

**Three Phases example (saveTimeline):**

```typescript
saveTimeline: (input: SaveTimelineInput) =>
  Effect.gen(function* () {
    // Logic phase -- FC pure decision
    const decision = validationSvc.decideSaveTimeline({
      originalPlan: input.originalPlan,
      currentStartDate: input.currentStartDate,
      currentPeriods: input.currentPeriods,
    });

    // Persistence phase -- based on decision
    return yield* matchSaveTimelineDecision(decision, {
      NoChanges: () => Effect.succeed(null),
      OnlyStartDate: ({ startDate }) =>
        gateway.updatePlanMetadata({ planId: input.planId, startDate }),
      OnlyPeriods: ({ periods }) =>
        gateway.updatePlanPeriods({ planId: input.planId, periods }),
      StartDateAndPeriods: ({ startDate, periods }) =>
        Effect.gen(function* () {
          yield* gateway.updatePlanMetadata({ planId: input.planId, startDate });
          return yield* gateway.updatePlanPeriods({ planId: input.planId, periods });
        }),
    });
  }),
```

**Program exports** provide the single entrypoint for actors, with all layers pre-provided:

```typescript
export const programSaveTimeline = (input: SaveTimelineInput) =>
  PlanApplicationService.saveTimeline(input).pipe(
    Effect.tapError((error) => Effect.logError('Failed to save timeline', { cause: extractErrorMessage(error) })),
    Effect.annotateLogs({ service: 'PlanApplicationService' }),
    Effect.provide(PlanApplicationServiceLive),
  );
```

### 3.3 Actor (State Machine)

**File:** `actors/{feature}.actor.ts`

XState state machines that orchestrate async operations. The actor is a "dumb coordinator" --
it knows WHAT to do but delegates decisions to the FC.

**Responsibility:**

- Manage async state transitions (Loading -> Success / Error)
- Invoke `program*` helpers via `fromCallback` + `runWithUi`
- Store domain-typed context (never DTOs)
- Emit domain-typed events for composable consumption
- Use FC predicates as guards

**Legitimate logic:**

- State transition definitions
- `fromCallback` wiring to `runWithUi`
- Guard conditions using FC predicates
- Merging context data into contract inputs (e.g. adding `currentCount`)

**Anti-patterns:**

- Business rules inline (delegate to FC)
- DTO transformations (belongs in gateway)
- UI formatting (belongs in composable)
- Direct HTTP calls (belongs in application service)

**Structure:**

```typescript
enum State {
  Idle = 'Idle',
  Loading = 'Loading',
  Ready = 'Ready',
}
enum Event {
  LOAD = 'LOAD',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_ERROR = 'ON_ERROR',
}
enum Emit {
  ERROR = 'ERROR',
  LOADED = 'LOADED',
}

const loadLogic = fromCallback<EventObject>(({ sendBack }) =>
  runWithUi(
    programListTemplates(),
    (templates) => sendBack({ type: Event.ON_SUCCESS, templates }),
    (error) => sendBack({ type: Event.ON_ERROR, error: extractErrorMessage(error) }),
  ),
);

export const featureMachine = setup({
  types: { context: {} as Context, events: {} as Events, emitted: {} as Emits },
  actors: { loadLogic },
  guards: {
    canDuplicate: ({ context }) => !isTemplateLimitReached(context.templates.length, MAX_PLAN_TEMPLATES), // FC predicate
  },
}).createMachine({
  /* state definitions */
});
```

### 3.4 Composable (View Model)

**File:** `composables/use{Feature}.ts`

The composable is the **View Model** -- the only layer that translates between domain types
and UI presentation. There are typically two kinds per feature:

| Kind                      | Purpose                                | Example                 |
| ------------------------- | -------------------------------------- | ----------------------- |
| **View Model Composable** | Derives presentation state from actor  | `usePlanTemplates()`    |
| **Form Composable**       | Manages local draft state + validation | `useTemplateEditForm()` |

**Responsibility:**

- Expose actor state via `useSelector` (computed derivations)
- Call FC functions in `computed()` for presentation logic
- Validate raw input through schemas before sending to actor
- Translate domain types to UI strings (via FC or utils)
- Handle emissions from actor (toasts, navigation)

**Legitimate logic:**

- `computed(() => isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES))`
- `computed(() => formatPeriodCountLabel(template.periodCount))`
- Schema validation: `validateCreatePlanInput(rawInput.value)`
- Clock access: `Effect.runSync(DateTime.nowAsDate)` when needed
- ID generation: `crypto.randomUUID()` for new entities

**Anti-patterns:**

- Inline business rules (delegate to FC)
- Direct HTTP calls (delegate to actor)
- Direct state machine manipulation (use `send()`)

**View Model example:**

```typescript
export function usePlanTemplates() {
  const { send, actorRef } = useActor(planTemplatesMachine);
  const templates = useSelector(actorRef, (s) => s.context.templates);

  // FC-derived presentation computeds
  const cards = computed(() =>
    sortTemplatesByRecency(templates.value).map((t) => ({
      id: t.id,
      name: t.name,
      periodCountLabel: formatPeriodCountLabel(t.periodCount),
    })),
  );
  const isLimitReached = computed(() => isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES));

  return { cards, isLimitReached, loadTemplates: () => send({ type: Event.LOAD }) };
}
```

**Form Composable example:**

```typescript
export function useTemplateEditForm(template: Ref<PlanTemplateDetail>) {
  const nameInput = ref('');
  const periodConfigs = ref<PeriodConfig[]>([]);

  // Reactive validation via schema
  const validationResult = computed(() => validateUpdateTemplateInput(rawInput.value));
  const validationErrors = computed(() => extractErrors(validationResult.value));

  // FC-derived change detection
  const hasChanges = computed(() => hasPeriodDurationsChanged(originalPeriods.value, periodConfigs.value));

  return { nameInput, periodConfigs, validationErrors, hasChanges };
}
```

### 3.5 Component (.vue)

**File:** `{Feature}View.vue` or `components/{ComponentName}.vue`

Pure presentation layer. Zero business logic.

**Responsibility:**

- Render data from composables
- Emit user events
- Local UI state only (hover, focus, open/closed)
- Styling and layout

**Legitimate logic:**

- `v-if="loading"`, `v-for="card in cards"`
- `@click="$emit('edit')"`, `@submit.prevent="handleSubmit"`
- `const isOpen = ref(false)` (local UI toggle)

**Anti-patterns:**

- Any `if` that involves domain rules
- Any computation on domain data
- Any HTTP or async call
- Any import from `domain/services/`

**Structure:**

```vue
<template>
  <div class="feature">
    <div v-for="card in cards" :key="card.id" class="feature__card">
      {{ card.name }}
      <span>{{ card.periodCountLabel }}</span>
      <!-- Pre-formatted by composable -->
    </div>
  </div>
</template>

<script setup lang="ts">
const { cards, isLimitReached, loadTemplates } = usePlanTemplates();
onMounted(() => loadTemplates());
</script>
```

---

## 4. Complete Data Flow Diagrams

### 4.1 Create Plan (Full Journey)

```
Component             Composable              Actor              App Service          Gateway
    |                     |                     |                     |                  |
    | click "Create"      |                     |                     |                  |
    |-------------------->|                     |                     |                  |
    |                     | validate(raw)       |                     |                  |
    |                     | via Schema          |                     |                  |
    |                     | raw -> PlanName,    |                     |                  |
    |                     |   PlanPeriodConfig   |                     |                  |
    |                     |-------------------->|                     |                  |
    |                     | send(CREATE,        |                     |                  |
    |                     |   domainInput)      |                     |                  |
    |                     |                     | fromCallback +      |                  |
    |                     |                     | runWithUi(program)  |                  |
    |                     |                     |-------------------> |                  |
    |                     |                     |                     | (server validates|
    |                     |                     |                     |  conflicts)       |
    |                     |                     |                     |----------------->|
    |                     |                     |                     |                  | POST /plans
    |                     |                     |                     |                  | boundary map:
    |                     |                     |                     |                  | DTO -> PlanDetail
    |                     |                     |                     |<-----------------|
    |                     |                     |<--------------------|  PlanDetail      |
    |                     |                     | sendBack(ON_CREATED)|                  |
    |                     |                     | emit PLAN_CREATED   |                  |
    |                     |<--------------------|                     |                  |
    |                     | emission handler:   |                     |                  |
    |                     | toast + navigate    |                     |                  |
    |<--------------------|                     |                     |                  |
    | re-render           |                     |                     |                  |
```

### 4.2 Save Timeline (Decision ADT with Branching Persistence)

This flow demonstrates the Three Phases pattern with a Decision ADT:

```
Component             Composable              Actor              App Service          Gateway
    |                     |                     |                     |                  |
    | click "Save"        |                     |                     |                  |
    |-------------------->|                     |                     |                  |
    |                     | validate via schema |                     |                  |
    |                     | build SaveTimeline  |                     |                  |
    |                     |   Input (branded)   |                     |                  |
    |                     |-------------------->|                     |                  |
    |                     | send(SAVE_TIMELINE, |                     |                  |
    |                     |   validatedInput)   |                     |                  |
    |                     |                     | runWithUi(          |                  |
    |                     |                     |   programSave...)   |                  |
    |                     |                     |-------------------> |                  |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 1: COLLECTION           |
    |                     |                     |          (from caller input)           |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 2: LOGIC (FC)           |
    |                     |                     |          decideSaveTimeline() returns: |
    |                     |                     |          one of 4 ADT variants         |
    |                     |                     |                     |                  |
    |                     |                     |          Phase 3: PERSISTENCE          |
    |                     |                     |          match on decision:            |
    |                     |                     |                     |                  |
    |                     |                     |  NoChanges:         | (skip)           |
    |                     |                     |  OnlyStartDate:     |--PATCH metadata->|
    |                     |                     |  OnlyPeriods:       |--PUT periods---->|
    |                     |                     |  StartDateAndPeriods|--PATCH then PUT->|
    |                     |                     |                     |                  |
    |                     |                     |<--------------------|  PlanDetail|null |
    |                     |                     | sendBack(ON_SAVED)  |                  |
    |                     |                     | emit TIMELINE_SAVED |                  |
    |                     |<--------------------|                     |                  |
    |                     | emission handler:   |                     |                  |
    |                     | syncFromServer()    |                     |                  |
    |                     | toast success       |                     |                  |
    |<--------------------|                     |                     |                  |
```

---

## 5. Responsibility Matrix

### Actor

| YES                                          | NO                                |
| -------------------------------------------- | --------------------------------- |
| State transitions (Idle -> Loading -> Ready) | Business rules (`if count >= 20`) |
| `fromCallback` + `runWithUi` for HTTP        | Direct HTTP calls                 |
| FC predicates in guards                      | Inline validation logic           |
| Domain-typed context (`PlanDetail`)          | Raw DTOs in context               |
| Emit structured events                       | Format strings for UI             |
| Merge context into contract inputs           | DTO <-> Domain mapping            |

### Composable

| YES                                     | NO                        |
| --------------------------------------- | ------------------------- |
| `useSelector` for actor state           | Direct HTTP calls         |
| FC functions in `computed()`            | Inline business rules     |
| Schema validation before actor          | State machine definitions |
| Domain -> UI string translation         | Raw DTO manipulation      |
| Emission handlers (toast, navigate)     | Actor state mutation      |
| Clock access via `DateTime.nowAsDate`   | `new Date()`              |
| ID generation via `crypto.randomUUID()` | Database writes           |

### Component

| YES                                   | NO                             |
| ------------------------------------- | ------------------------------ |
| `v-if`, `v-for` on composable data    | Any `if` with domain rules     |
| `@click` -> composable method         | Direct actor `send()`          |
| Local UI refs (hover, focus)          | Business computations          |
| Scoped SCSS with BEM                  | Import from `domain/services/` |
| Props from composable (pre-formatted) | Format domain values inline    |
| `$emit` user events                   | HTTP calls of any kind         |

---

## 6. API <-> Web Analogy Table

| API Concept           | Web Equivalent           | Web File Location                   | Shared Purpose             |
| --------------------- | ------------------------ | ----------------------------------- | -------------------------- |
| Handler               | Actor                    | `actors/*.actor.ts`                 | Orchestrates the operation |
| Repository            | API Client (Gateway)     | `services/*-api-client.service.ts`  | Talks to external system   |
| Application Service   | Application Service      | `services/*-application.service.ts` | Three Phases coordinator   |
| Request Schema        | Input Schema             | `domain/schemas/*-input.schema.ts`  | Validates incoming data    |
| Response Schema       | Boundary Mapper (decode) | Inside gateway service              | Transforms wire -> domain  |
| Domain Service        | Domain Service           | `domain/services/*.service.ts`      | Pure business logic        |
| Domain Error          | Domain Error             | `domain/errors.ts`                  | Typed failures             |
| Contract              | Contract                 | `domain/contracts/*.contract.ts`    | Use-case interface         |
| `Effect.annotateLogs` | `Effect.annotateLogs`    | All services                        | Structured logging         |

### Key Differences

| Concern                 | API                        | Web                            |
| ----------------------- | -------------------------- | ------------------------------ |
| External I/O            | Database (PostgreSQL)      | HTTP API (backend)             |
| State management        | Stateless (per-request)    | Stateful (XState machines)     |
| Output boundary         | JSON HTTP response         | Reactive Vue interface         |
| UUID generation         | Repository (authoritative) | Trusts API (except temp IDs)   |
| Time for business logic | Service (`DateTime.now`)   | Trusts API (server-side)       |
| Time for UI display     | N/A                        | Gateway (`DateTime.nowAsDate`) |
| Error presentation      | Error codes in response    | Toast messages via composable  |

---

## 7. The FC Delegation Rule

### The Practical Test

Before writing an `if/else` or comparison in a composable, actor, or component, ask:

> "Is this a **business decision** (rules about the domain) OR a **shell concern**
> (rules about I/O, state transitions, or UI mechanics)?"

**If it is a business decision, extract it to the FC** (`domain/services/`).

### Examples

| Code                                   | Current Location | Correct Location                         | Why                                  |
| -------------------------------------- | ---------------- | ---------------------------------------- | ------------------------------------ |
| `templates.length >= 20`               | Composable       | FC: `isTemplateLimitReached(count, max)` | Business rule (template cap)         |
| `state.matches('Loading')`             | Composable       | Composable                               | Shell concern (state check)          |
| `startDate !== originalStartDate`      | Actor            | FC: `hasStartDateChanged(a, b)`          | Business decision (change detection) |
| `hover.value = true`                   | Component        | Component                                | UI mechanics (local state)           |
| `period.fasting + period.eating`       | Actor            | FC: `calculatePeriodDates()`             | Domain calculation                   |
| `sendBack({ type: Event.ON_SUCCESS })` | Actor            | Actor                                    | Shell concern (state transition)     |

### Anti-Pattern Gallery

**1. Inline business rule in composable:**

```typescript
// WRONG -- business rule embedded in shell
const canSave = computed(() => templates.value.length < 20);

// RIGHT -- delegate to FC
const canSave = computed(() => !isTemplateLimitReached(templates.value.length, MAX_PLAN_TEMPLATES));
```

**2. Change detection duplicated in form composable:**

```typescript
// WRONG -- reimplements what FC already provides
const hasChanges = computed(() =>
  periodConfigs.value.some(
    (p, i) =>
      p.fastingDuration !== original.value[i]?.fastingDuration || p.eatingWindow !== original.value[i]?.eatingWindow,
  ),
);

// RIGHT -- delegate to FC
const hasChanges = computed(() => hasPeriodDurationsChanged(original.value, periodConfigs.value));
```

**3. Domain transformation in actor:**

```typescript
// WRONG -- PeriodOrder(i + 1) is domain logic in the actor
periods: input.periods.map((p, i) => ({
  ...p,
  order: PeriodOrder(i + 1),
}));

// RIGHT -- FC service or schema handles order assignment
// The schema or composable assigns order before sending to actor
```

**4. Date calculation in composable:**

```typescript
// WRONG -- domain math in shell
const addPeriod = () => {
  const last = periodConfigs.value.at(-1)!;
  const duration = (last.fastingDuration + last.eatingWindow) * 60 * 60 * 1000;
  const nextStart = new Date(last.startDate.getTime() + duration);
  // ...
};

// RIGHT -- delegate to FC
const addPeriod = () => {
  const next = computeNextContiguousPeriod(periodConfigs.value.at(-1)!);
  periodConfigs.value = [...periodConfigs.value, { id: crypto.randomUUID(), ...next }];
};
```

---

## 8. Key Architectural Rules

### 8.1 Clock Rule

Shell code that needs the current time MUST use `DateTime.nowAsDate` from Effect, never
`new Date()`. FC functions receive `now: Date` as a parameter -- they never access the clock.

| Layer               | Can Access Time? | How                                            |
| ------------------- | ---------------- | ---------------------------------------------- |
| Component           | NEVER            | Delegate to composable                         |
| Composable          | NEVER directly   | `Effect.runSync(DateTime.nowAsDate)` if needed |
| Actor               | NEVER            | Delegate to application service                |
| Application Service | YES              | `DateTime.nowAsDate` from Effect               |
| Gateway             | YES              | `DateTime.nowAsDate` from Effect               |
| FC Service          | NEVER            | Receives `now: Date` as parameter              |

### 8.2 Domain-Typed Actor Context

Actor context stores **only domain types**, never raw DTOs from the API:

```typescript
// WRONG
type Context = { plan: PlanWithPeriodsResponse | null }; // DTO leaking

// RIGHT
type Context = { plan: PlanDetail | null }; // Domain type (gateway mapped)
```

### 8.3 Composable Validates Before Actor

The composable validates raw input through schemas BEFORE sending to the actor.
The actor receives only domain-typed input:

```typescript
// In composable
const handleSave = () => {
  const result = validateUpdateTemplateInput(rawInput.value);
  if (Either.isRight(result)) {
    send({ type: Event.SAVE, input: result.right }); // Domain-typed
  }
};
```

### 8.4 Component Has Zero Business Logic

Components render pre-formatted data from composables. They emit events but never
make domain decisions:

```typescript
// WRONG -- business logic in component
<span>{{ template.periodCount === 1 ? '1 period' : `${template.periodCount} periods` }}</span>

// RIGHT -- composable provides pre-formatted string
<span>{{ card.periodCountLabel }}</span>  // "3 periods" already computed
```

### 8.5 HTTP Requests Only Through Actors

ALL HTTP requests MUST flow through XState actors via `fromCallback` + `runWithUi`.
Never call Effect programs directly in components or composables.

```typescript
// WRONG -- direct call in composable
onMounted(() => {
  runWithUi(
    programGetData(),
    (result) => {
      data.value = result;
    },
    (error) => {
      /* ... */
    },
  );
});

// RIGHT -- through actor
const loadLogic = fromCallback(({ sendBack }) =>
  runWithUi(programGetData(), (r) => sendBack({ type: Event.ON_SUCCESS, r }) /* ... */),
);
// Composable: send({ type: Event.LOAD })
```

### 8.6 runWithUi Bridge

`runWithUi` bridges Effect's success/error channels to UI callbacks for XState integration:

```typescript
export function runWithUi<A, E>(
  eff: Effect.Effect<A, E>,
  onSuccess: (value: A) => void,
  onFailure: (error: E) => void,
): () => void {
  const fiber = Effect.runFork(
    eff.pipe(
      Effect.matchEffect({
        onSuccess: (value) => Effect.sync(() => onSuccess(value)),
        onFailure: (err) => Effect.sync(() => onFailure(err)),
      }),
    ),
  );
  return () => {
    Effect.runFork(Fiber.interruptFork(fiber));
  };
}
```

The returned cleanup function interrupts the fiber. `fromCallback` in XState uses it
as the actor's cleanup handler.

---

## 9. Directory Structure Reference

```
web/src/views/{feature}/
  |
  |-- {Feature}View.vue                           # Main view component
  |-- {Feature}EditView.vue                       # Edit view (if applicable)
  |
  |-- actors/
  |   |-- {feature}.actor.ts                      # List/main state machine
  |   +-- {feature}Edit.actor.ts                  # Edit-specific state machine
  |
  |-- services/
  |   |-- {feature}-api-client.service.ts         # Gateway: HTTP + boundary mappers
  |   +-- {feature}-application.service.ts        # Three Phases coordinator + programs
  |
  |-- composables/
  |   |-- use{Feature}.ts                         # View Model: list/main
  |   |-- use{Feature}Edit.ts                     # View Model: edit
  |   |-- use{Feature}EditForm.ts                 # Form: draft state + validation
  |   |-- use{Feature}Emissions.ts                # Emission handler: list/main
  |   +-- use{Feature}EditEmissions.ts            # Emission handler: edit
  |
  |-- components/
  |   +-- {ComponentName}.vue                     # Feature-specific components
  |
  |-- domain/
  |   |-- {feature}.model.ts                      # Constants, brands, VOs, ADTs
  |   |-- errors.ts                               # Domain errors (Data.TaggedError)
  |   |-- functional-domain-design.md             # Feature-specific FC/IS design doc
  |   |-- index.ts                                # Barrel re-exports
  |   |
  |   |-- contracts/
  |   |   |-- {use-case}.contract.ts              # One per mutation
  |   |   +-- index.ts
  |   |
  |   |-- schemas/
  |   |   |-- {use-case}-input.schema.ts          # One per form
  |   |   +-- index.ts
  |   |
  |   +-- services/
  |       |-- {feature}-validation.service.ts     # Boolean predicates + Decision ADTs
  |       |-- {feature}-calculation.service.ts    # Pure date/math calculations
  |       +-- index.ts
  |
  +-- utils/                                      # Formatting, presentation helpers
      +-- {feature}-formatting.ts
```

---

## 10. Decision Flowchart: Where Does This Logic Go?

```
START: "I need to write some logic..."
  |
  |-- Does it involve HTTP requests?
  |     YES --> Is it raw HTTP + DTO mapping?
  |               YES --> Gateway (api-client.service.ts)
  |               NO  --> Is it coordinating Collection/Logic/Persistence?
  |                         YES --> Application Service
  |                         NO  --> Program export (for actor consumption)
  |
  |-- Does it involve state transitions?
  |     YES --> Actor (XState machine)
  |
  |-- Is it a business rule or domain calculation?
  |     YES --> Can it be a pure function (no I/O, deterministic)?
  |               YES --> FC Service (domain/services/)
  |               NO  --> Re-examine: extract the pure part to FC,
  |                       keep I/O in Application Service
  |
  |-- Does it transform raw UI input to domain types?
  |     YES --> Input Schema (domain/schemas/)
  |
  |-- Does it transform domain types to UI display?
  |     YES --> Composable computed (using FC functions or utils)
  |
  |-- Does it validate form input reactively?
  |     YES --> Form Composable (with schema validation)
  |
  |-- Is it local UI mechanics (hover, focus, open/close)?
  |     YES --> Component
  |
  |-- Does it handle side effects from actor emissions?
  |     YES --> Emission Composable (toast, navigation)
  |
  |-- None of the above?
        --> Re-examine: you may be conflating concerns.
            Split it into a pure part (FC) and an I/O part (Shell).
```

---

## 11. Glossary

| Term                      | Definition                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **FC**                    | Functional Core. Pure functions with no I/O, no state, no framework coupling. The `domain/` folder.        |
| **IS**                    | Imperative Shell. Everything outside the FC that orchestrates I/O and state.                               |
| **Shell**                 | Synonym for IS. In the web, there are two: External (API-side) and Internal (UI-side).                     |
| **Gateway**               | The API Client Service. Web equivalent of a Repository. HTTP + boundary mappers.                           |
| **Three Phases**          | Application Service pattern: Collection -> Logic -> Persistence.                                           |
| **Contract**              | Interface defining what a use-case operation needs. Uses domain-typed fields.                              |
| **Schema (Input)**        | Validator that transforms raw UI input into domain-typed contract input.                                   |
| **Decision ADT**          | A `Data.TaggedEnum` that reifies a business decision as data (e.g. `SaveTimelineDecision`).                |
| **Branded Type**          | A primitive refined with domain constraints via `Brand.refined` (e.g. `PlanName`).                         |
| **Value Object**          | An `S.Class` with multiple fields, no identity. Compared by value.                                         |
| **Smart Constructor**     | A function that parses unknown values into branded types, returning `Effect` or `Option`.                  |
| **Boundary Mapper**       | A function in the gateway that converts between DTO (wire format) and domain types.                        |
| **Clock Rule**            | Shell uses `DateTime.nowAsDate`; FC receives `now: Date` as parameter. Never `new Date()`.                 |
| **Dual Export**           | FC services export both standalone functions and an `Effect.Service` wrapper.                              |
| **Program Export**        | A `program*` function from Application Service with all layers pre-provided. Single entrypoint for actors. |
| **Emission**              | An event emitted by an XState actor, handled by an emission composable (toasts, navigation).               |
| **Form Composable**       | Manages local draft state, reactive schema validation, and change detection.                               |
| **View Model Composable** | Derives presentation state from actor using `useSelector` + FC computeds.                                  |
| **runWithUi**             | Helper that bridges Effect success/error channels to UI callbacks for XState.                              |

---

## 12. FC/IS Compliance Checklist

Use this checklist when reviewing a feature for FC/IS compliance.

### Domain Layer (Functional Core)

- [ ] All domain constants are **named** (no magic numbers in predicates or error messages)
- [ ] Branded types reference constants in predicates and error messages
- [ ] Value Objects use `S.Class`, compared by value, no identity for pre-persistence objects
- [ ] Decision ADTs use `Data.TaggedEnum` with exhaustive matching (`$match`)
- [ ] Smart constructors return `Effect` (effectful) or `Option` (synchronous)
- [ ] Every mutating use-case has a **contract** in `domain/contracts/`
- [ ] Every form has an **input schema** in `domain/schemas/` with validate + extract functions
- [ ] FC services have the **mandatory header** with Three Phases context
- [ ] FC services use the **dual export** pattern (standalone + Effect.Service)
- [ ] FC services contain **zero I/O** -- no HTTP, no clock, no randomness
- [ ] Domain errors use `Data.TaggedError`

### Gateway (API Client Service)

- [ ] Returns **only domain types**, never raw DTOs
- [ ] Boundary mappers handle both directions (decode: DTO -> Domain, encode: Domain -> DTO)
- [ ] HTTP errors mapped to domain errors using `Match.value`
- [ ] Uses `AuthenticatedHttpClient` dependency
- [ ] Error type aliases defined per operation

### Application Service

- [ ] Every method documents its **Three Phases** in comments
- [ ] FC decision functions called in **Logic phase** (not inline rules)
- [ ] `program*` exports provide all layers via `Effect.provide`
- [ ] Error logging via `Effect.tapError` + `Effect.annotateLogs`
- [ ] Dependencies: API Client + FC Services only

### Actor (State Machine)

- [ ] Context stores **domain types only** (no DTOs)
- [ ] Guards use **FC predicates** (not inline conditions with magic numbers)
- [ ] HTTP calls go through `fromCallback` + `runWithUi` + `program*`
- [ ] Actor emits domain-typed events
- [ ] No business logic inline -- delegates to FC or Application Service

### Composable (View Model)

- [ ] Validates input through **schemas before sending to actor**
- [ ] Presentation logic uses **FC functions in computed()** or utils
- [ ] No direct HTTP calls
- [ ] Clock access uses `DateTime.nowAsDate`, never `new Date()`
- [ ] ID generation uses `crypto.randomUUID()` only in the shell

### Component (.vue)

- [ ] **Zero business logic** -- all rules come from composable
- [ ] Renders pre-formatted data from composable
- [ ] Emits events, never calls `send()` on actor directly
- [ ] Only local UI state (hover, focus, toggle)
- [ ] No imports from `domain/services/`

### Cross-Cutting

- [ ] No `new Date()` anywhere except in Effect's `DateTime.nowAsDate`
- [ ] No `Match.orElse` for domain errors -- use `Match.exhaustive`
- [ ] Feature has a `domain/functional-domain-design.md`
- [ ] All error handling uses typed `Data.TaggedError`, not string matching
